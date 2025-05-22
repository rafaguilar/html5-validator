const AdmZip = require('adm-zip');
const { JSDOM } = require('jsdom');
const CSS = require('css');
const { ESLint } = require('eslint');
const imageSize = require('image-size');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const libxml = require('libxmljs2');
const iconv = require('iconv-lite');

// Función para escapar caracteres HTML
function escapeHtml(str) {
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, match => htmlEntities[match]);
}

// Función para sanear cadenas en mensajes de error
function sanitizeErrorMessage(str) {
  return str.replace(/[&<>"']/g, c => `\\${c}`);
}

function extractClickTags(scriptContent, fileName = 'inline HTML script') {
  const result = {
    clickTags: [],
    warnings: [],
    errors: []
  };

  const clickTagRegex = /(\b(?:var|let|const)\s+)?clickTag(\d*)\s*=\s*["'](.*?)["']/;
  const urlRegex = /^https?:\/\/[\w\-]+(\.[\w\-]+)+[/#?]?.*$/i;
  const httpsRegex = /^https:\/\//i;

  const normalizedContent = scriptContent.replace(/\s+/g, ' ').trim();
  const declarations = normalizedContent
    .split(/[,;]/)
    .map(decl => decl.trim())
    .filter(decl => decl && decl.includes('clickTag') && !decl.includes('window.open'));

  let lastDeclarationType = null;

  declarations.forEach((decl, index) => {
    const match = clickTagRegex.exec(decl);
    if (match) {
      const declarationType = match[1] ? match[1].trim() : lastDeclarationType;
      if (!declarationType) {
        return; // Ignorar si no hay var, let o const
      }
      const clickTagName = match[2] ? 'clickTag' + match[2] : 'clickTag';
      const url = match[3];

      if (match[1]) {
        lastDeclarationType = match[1].trim();
      }

      console.log('Encontrado en ' + fileName + ' ' + (index + 1) + ': ' + clickTagName + ' = ' + url + ' (Match: ' + match[0] + ')');

      const clickTagDetail = {
        name: clickTagName,
        url: url,
        file: fileName + ' ' + (index + 1),
        valid: true,
        used: false,
        urlValid: false
      };

      if (urlRegex.test(url)) {
        clickTagDetail.urlValid = true;
        if (!httpsRegex.test(url)) {
          result.warnings.push(
            'La URL del ' + clickTagName + ' (' + url + ') en ' + clickTagDetail.file + ' usa HTTP en lugar de HTTPS.'
          );
        }
      } else {
        clickTagDetail.valid = false;
        result.errors.push(
          'La URL del ' + clickTagName + ' (' + url + ') en ' + clickTagDetail.file + ' no es válida.'
        );
      }

      result.clickTags.push(clickTagDetail);
    }
  });

  return result;
}

function folderExists(zipEntries, folderPath, basePath = '') {
  const normalizedFolderPath = path.posix.normalize(folderPath).replace(/^\/+/, '').replace(/\\/g, '/');
  const normalizedBasePath = basePath
    ? path.posix.normalize(basePath).replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '')
    : '';
  const targetPath = normalizedBasePath ? `${normalizedBasePath}/${normalizedFolderPath}` : normalizedFolderPath;
  console.log(`Verificando existencia de carpeta: ${targetPath} (folderPath: ${normalizedFolderPath}, basePath: ${normalizedBasePath})`);

  const exists = zipEntries.some(entry => {
    let entryName = entry.entryName.replace(/\\/g, '/');
    entryName = path.posix.normalize(entryName).replace(/^\/+/, '').replace(/\/+$/, '');
    if (entry.isDirectory) {
      return entryName === targetPath || entryName.startsWith(targetPath + '/');
    }
    const dir = path.dirname(entryName).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    return dir === targetPath || dir.startsWith(targetPath + '/');
  });

  console.log(`Resultado de folderExists para ${targetPath}: ${exists}`);
  return exists;
}

async function validateBanner(zipBuffer) {
  const result = { errors: [], warnings: [], details: {} };
  const zip = new AdmZip(zipBuffer);
  const reportId = uuidv4();
  const reportDir = path.join(__dirname, '..', 'reports', reportId);
  const reportPath = path.join(reportDir, 'report.html');

  // Crear directorio temporal para el informe y assets
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Detectar carpetas comunes
  const imgFolder = detectFolder(zip, ['img', 'images', 'assets/img', 'assets']);

  // 1. Validar tamaño del ZIP
  const zipSizeKB = Buffer.byteLength(zipBuffer) / 1024;
  if (zipSizeKB > 200) {
    result.errors.push(`El tamaño del ZIP (${zipSizeKB.toFixed(2)} KB) excede el límite de 200 KB.`);
  }
  result.details.zipSize = `${zipSizeKB.toFixed(2)} KB`;

  // 2. Extraer contenido del ZIP
  const zipEntries = zip.getEntries();
  console.log('Estructura del ZIP:', zipEntries.map(e => ({
    name: e.entryName,
    isDirectory: e.isDirectory
  })));
  let htmlContent = null;
  let htmlEntry = null;
  const initialLoadFiles = [];
  const imageFiles = [];
  const jsFiles = [];

  try {
    // Identificar archivos HTML y otros assets
    for (const entry of zipEntries) {
      if (entry.isDirectory || entry.entryName.includes('__MACOSX/') || entry.entryName.startsWith('.')) {
        continue;
      }
      const fileName = path.basename(entry.entryName);
      console.log(`Procesando entrada: ${entry.entryName}`);
      if (fileName.match(/\.html$/i)) {
        // Intentar leer como UTF-8
        try {
          htmlContent = zip.readAsText(entry);
          console.log(`HTML encontrado (UTF-8): ${entry.entryName}`);
        } catch (e) {
          // Intentar leer como UTF-16
          try {
            const buffer = entry.getData();
            htmlContent = iconv.decode(buffer, 'utf16');
            console.log(`HTML encontrado (UTF-16): ${entry.entryName}`);
          } catch (err) {
            result.warnings.push(`No se pudo leer el archivo HTML (${entry.entryName}): ${err.message}`);
            continue;
          }
        }
        htmlEntry = entry;
        initialLoadFiles.push(entry);
      } else if (fileName.match(/\.(css|js)$/i)) {
        initialLoadFiles.push(entry);
        if (fileName.match(/\.js$/i)) {
          jsFiles.push(entry);
        }
      } else if (fileName.match(/\.(jpg|jpeg|png|gif|svg)$/i)) {
        imageFiles.push(entry);
        initialLoadFiles.push(entry);
      }
    }

    if (!htmlContent) {
      result.errors.push('No se encontró un archivo HTML válido en el ZIP.');
      const reportHtml = generateReport(result, null, reportId);
      fs.writeFileSync(reportPath, reportHtml);
      return { result, reportPath };
    }

    // Extraer assets al directorio temporal preservando la estructura de carpetas
    for (const entry of zipEntries) {
      if (entry.isDirectory || entry.entryName.includes('__MACOSX/') || entry.entryName.startsWith('.')) {
        continue;
      }
      const relativePath = entry.entryName;
      const outputPath = path.join(reportDir, relativePath);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, entry.getData());
    }

    // 3. Validar tamaño de la carga inicial
    let initialLoadSizeKB = 0;
    for (const entry of initialLoadFiles) {
      initialLoadSizeKB += (entry.getData().length / 1024);
    }
    if (initialLoadSizeKB > 150) {
      result.warnings.push(`La carga inicial (${initialLoadSizeKB.toFixed(2)} KB) excede el límite recomendado de 150 KB.`);
    }
    result.details.initialLoadSize = `${initialLoadSizeKB.toFixed(2)} KB`;

    // 4. Validar metaetiqueta ad.size
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    const adSizeMeta = document.querySelector('meta[name="ad.size"]');
    if (!adSizeMeta) {
      result.errors.push('Falta la metaetiqueta ad.size.');
    } else {
      const adSizeContent = adSizeMeta.getAttribute('content');
      result.details.adSize = adSizeContent;
    }

    // 5. Validar estructura HTML y SVG en línea
    const htmlErrors = [];
    if (htmlContent.includes('<html') && !htmlContent.includes('</html>')) {
      htmlErrors.push('Etiqueta <html> no cerrada.');
    }
    // Validar SVG en línea
    const svgElements = document.querySelectorAll('svg');
    for (const svgElement of svgElements) {
      try {
        const svgContent = svgElement.outerHTML;
        libxml.parseXml(svgContent, { recover: false });
      } catch (error) {
        result.errors.push(`SVG en línea inválido en el HTML: ${error.message}`);
      }
    }
    if (htmlErrors.length > 0) {
      result.errors.push(`Errores en la estructura HTML: ${htmlErrors.join(', ')}`);
    }

// 6. Validar imágenes referenciadas en etiquetas <img>
const imgElements = document.querySelectorAll('img');
const htmlBasePath = htmlEntry ? path.dirname(htmlEntry.entryName) : '';
console.log(`Carpeta base del HTML: ${htmlBasePath}`);
for (const imgElement of imgElements) {
  const src = imgElement.getAttribute('src');
  if (!src) {
    result.errors.push('Etiqueta <img> sin atributo src.');
    continue;
  }

  // Normalizar la ruta del src
  const normalizedSrc = path.posix.normalize(src).replace(/^\/+/, '');
  console.log(`Verificando imagen referenciada: ${normalizedSrc}`);

  // Extraer la carpeta hasta el primer '/'
  let folderPath = '.';
  const firstSlashIndex = normalizedSrc.indexOf('/');
  if (firstSlashIndex !== -1) {
    folderPath = normalizedSrc.substring(0, firstSlashIndex);
  }

  console.log(`folderPath: ${folderPath}, normalizedSrc: ${normalizedSrc}`);

  // Verificar si la carpeta existe (si aplica)
  if (folderPath !== '.') {
    if (!folderExists(zipEntries, folderPath, htmlBasePath)) {
      const errorMessage = `La carpeta ${sanitizeErrorMessage(folderPath)} especificada en img src=${sanitizeErrorMessage(src)} no existe en el ZIP.`;
      console.log(`Añadiendo error: ${errorMessage}`);
      result.errors.push(errorMessage);
      continue;
    }
  }

  // Verificar si el archivo de imagen existe
  const expectedImgPath = htmlBasePath && folderPath !== '.'
    ? `${htmlBasePath}/${normalizedSrc}`
    : folderPath === '.'
    ? htmlBasePath
      ? `${htmlBasePath}/${normalizedSrc}`
      : normalizedSrc
    : normalizedSrc;
  console.log(`Buscando imagen en: ${expectedImgPath}`);

  const imgEntry = zipEntries.find(e =>
    path.posix.normalize(e.entryName).replace(/^\/+/, '') === path.posix.normalize(expectedImgPath).replace(/^\/+/, '') &&
    !e.isDirectory
  );

  if (!imgEntry) {
    const errorMessage = `La imagen referenciada en img src=${sanitizeErrorMessage(src)} no se encontró en ${folderPath === '.' ? 'raíz' : sanitizeErrorMessage(folderPath)}.`;
    console.log(`Añadiendo error: ${errorMessage}`);
    result.errors.push(errorMessage);
    continue;
  }

  // Verificar formato de la imagen
  const fileExt = path.extname(imgEntry.entryName).toLowerCase().replace('.', '');
  if (!['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(fileExt)) {
    const errorMessage = `La imagen referenciada en img src=${sanitizeErrorMessage(src)} (${sanitizeErrorMessage(imgEntry.entryName)}) tiene un formato no permitido.`;
    console.log(`Añadiendo error: ${errorMessage}`);
    result.errors.push(errorMessage);
  }
}

// 7. Validar estructura CSS y imágenes referenciadas
for (const entry of zipEntries) {
  if (entry.entryName.match(/\.css$/i) && !entry.entryName.includes('__MACOSX/')) {
    try {
      const cssContent = zip.readAsText(entry);
      const parsedCSS = CSS.parse(cssContent);
      if (parsedCSS.stylesheet.parsingErrors.length > 0) {
        result.errors.push(`Errores en el CSS (${entry.entryName}): ${parsedCSS.stylesheet.parsingErrors.map(e => e.message).join(', ')}`);
      }

      // Determinar la carpeta base del archivo CSS
      const cssBasePath = path.dirname(entry.entryName);
      console.log(`Carpeta base del CSS (${entry.entryName}): ${cssBasePath}`);

      // Validar URLs en background y background-image
      for (const rule of parsedCSS.stylesheet.rules) {
        if (rule.type === 'rule' && rule.declarations) {
          for (const declaration of rule.declarations) {
            if ((declaration.property === 'background' || declaration.property === 'background-image') && declaration.value.includes('url(')) {
              const urlMatch = declaration.value.match(/url\(['"]?([^'"]+)['"]?\)/i);
              if (urlMatch) {
                const imgPath = urlMatch[1];
                // Normalizar la ruta relativa al directorio del CSS
                const normalizedImgPath = path.posix.normalize(path.posix.join(path.dirname(entry.entryName), imgPath)).replace(/^\/+/, '');
                console.log(`Verificando imagen referenciada en CSS (${declaration.property}): ${imgPath} (normalizada: ${normalizedImgPath})`);

                // Extraer la carpeta hasta el primer '/' después de resolver la ruta
                let folderPath = '.';
                const firstSlashIndex = normalizedImgPath.indexOf('/');
                if (firstSlashIndex !== -1) {
                  folderPath = normalizedImgPath.substring(0, firstSlashIndex);
                }

                console.log(`folderPath: ${folderPath}, normalizedImgPath: ${normalizedImgPath}`);

                // Verificar si la carpeta existe (si aplica)
                if (folderPath !== '.') {
                  if (!folderExists(zipEntries, folderPath)) {
                    const errorMessage = `La carpeta ${sanitizeErrorMessage(folderPath)} especificada en ${declaration.property} url=${sanitizeErrorMessage(imgPath)} no existe en el ZIP.`;
                    console.log(`Añadiendo error: ${errorMessage}`);
                    result.errors.push(errorMessage);
                    continue;
                  }
                }

                // Verificar si el archivo de imagen existe
                const expectedImgPath = normalizedImgPath;
                console.log(`Buscando imagen en: ${expectedImgPath}`);

                const imgEntry = zipEntries.find(e =>
                  path.posix.normalize(e.entryName).replace(/^\/+/, '') === path.posix.normalize(expectedImgPath).replace(/^\/+/, '') &&
                  !e.isDirectory
                );

                if (!imgEntry) {
                  const errorMessage = `La imagen referenciada en ${declaration.property} url=${sanitizeErrorMessage(imgPath)} no se encontró en ${folderPath === '.' ? 'raíz' : sanitizeErrorMessage(folderPath)}.`;
                  console.log(`Añadiendo error: ${errorMessage}`);
                  result.errors.push(errorMessage);
                  continue;
                }

                // Verificar formato de la imagen
                const fileExt = path.extname(imgEntry.entryName).toLowerCase().replace('.', '');
                if (!['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(fileExt)) {
                  const errorMessage = `La imagen referenciada en ${declaration.property} url=${sanitizeErrorMessage(imgPath)} (${sanitizeErrorMessage(imgEntry.entryName)}) tiene un formato no permitido.`;
                  console.log(`Añadiendo error: ${errorMessage}`);
                  result.errors.push(errorMessage);
                  continue;
                }

                // Validar SVG si corresponde
                if (fileExt === 'svg') {
                  try {
                    const svgContent = zip.readAsText(imgEntry);
                    libxml.parseXml(svgContent, { recover: false });
                  } catch (error) {
                    const errorMessage = `SVG referenciado en ${declaration.property} url=${sanitizeErrorMessage(imgPath)} (${sanitizeErrorMessage(imgEntry.entryName)}) inválido: ${error.message}`;
                    console.log(`Añadiendo error: ${errorMessage}`);
                    result.errors.push(errorMessage);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      result.warnings.push(`No se pudo analizar el CSS (${entry.entryName}): ${error.message}`);
    }
  }
}
    // 8. Validar estructura JavaScript
    let eslint;
    try {
      eslint = new ESLint({
        overrideConfigFile: path.join(__dirname, '..', '.eslintrc.js'),
        overrideConfig: {
          env: { browser: true, es2021: true, node: true },
          parserOptions: { sourceType: 'module' },
          rules: {
            'no-undef': 'warn',
            'no-unused-vars': 'warn',
          },
        },
      });
    } catch (error) {
      result.warnings.push(`No se pudo inicializar ESLint: ${error.message}. Continuando sin validación de JS.`);
      eslint = null;
    }

    for (const entry of jsFiles) {
      if (entry.entryName.includes('__MACOSX/')) continue;
      try {
        const jsContent = zip.readAsText(entry);
        if (eslint) {
          const [lintResult] = await eslint.lintText(jsContent, { filePath: entry.entryName });
          if (lintResult.errorCount > 0) {
            result.warnings.push(`Advertencias en el JavaScript (${entry.entryName}): ${lintResult.messages.map(m => m.message).join(', ')}`);
          }
        }
      } catch (error) {
        result.warnings.push(`No se pudo analizar el JavaScript (${entry.entryName}): ${error.message}`);
      }
    }

    // 9. Validar tipos de archivo y resolución de imágenes
    for (const entry of imageFiles) {
      if (entry.entryName.includes('__MACOSX/')) continue;
      const fileName = entry.entryName;
      const fileExt = fileName.split('.').pop().toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(fileExt)) {
        result.errors.push(`Formato de archivo no permitido: ${fileName}`);
        continue;
      }
      if (fileExt === 'svg') {
        try {
          const svgContent = zip.readAsText(entry);
          libxml.parseXml(svgContent, { recover: false });
        } catch (error) {
          result.errors.push(`Archivo SVG (${fileName}) inválido: ${error.message}`);
        }
      } else {
        try {
          const imageData = entry.getData();
          const dimensions = imageSize(imageData);
          if (!dimensions.width || !dimensions.height) {
            result.warnings.push(`No se pudieron obtener las dimensiones de ${fileName}`);
            continue;
          }
          const dpi = dimensions.width / (dimensions.widthInInches || dimensions.width / 72);
          if (dpi < 72) {
            result.warnings.push(`La imagen ${fileName} tiene una resolución menor a 72 DPI (${dpi.toFixed(2)} DPI).`);
          }
        } catch (error) {
          result.warnings.push(`No se pudo analizar la resolución de ${fileName}: ${error.message}`);
        }
      }
    }

    // 10. Validar clicktags
    const clickTagDetails = [];

    // Buscar en scripts del HTML
    const scriptElements = document.querySelectorAll('script');
    for (const [index, script] of Array.from(scriptElements).entries()) {
      if (script.textContent) {
        console.log(`Procesando script inline ${index + 1}:`);
        const clickTagResult = extractClickTags(script.textContent, `inline HTML script ${index + 1}`);
        clickTagDetails.push(...clickTagResult.clickTags);
        result.warnings.push(...clickTagResult.warnings);
        result.errors.push(...clickTagResult.errors);
      } else {
        console.log(`Script inline ${index + 1} vacío o sin contenido`);
      }
    }

    // Verificar uso de clickTags
    for (const clickTag of clickTagDetails) {
      try {
        const selector = `a[href*="${clickTag.name}"], [onclick*="${clickTag.name}"]`;
        const interactiveElements = document.querySelectorAll(selector);
        if (interactiveElements.length > 0) {
          clickTag.used = true;
          console.log(`Encontrado uso directo de ${clickTag.name} en elementos interactivos`);
        } else {
          const scripts = Array.from(scriptElements).map(s => s.textContent);
          const jsContents = jsFiles.map(entry => zip.readAsText(entry));
          const allScripts = [...scripts, ...jsContents];
          const usesClickTag = allScripts.some(script => 
            script.includes(`window.open(window.${clickTag.name})`) || 
            script.includes(`window.open(${clickTag.name})`) || 
            new RegExp(`\\b${clickTag.name}\\b`).test(script)
          );
          if (usesClickTag) {
            clickTag.used = true;
            console.log(`Encontrado uso de ${clickTag.name} en scripts`);
          } else {
            result.errors.push(`El ${clickTag.name} en ${clickTag.file} no se utiliza en ningún elemento interactivo.`);
          }
        }
      } catch (error) {
        result.warnings.push(`Error al verificar uso de ${clickTag.name} en ${clickTag.file}: ${error.message}`);
      }
    }

    if (clickTagDetails.length === 0) {
      result.errors.push('No se encontró ningún clickTag en el HTML.');
    }
    result.details.clickTags = clickTagDetails;

    // Depuración: Loguear todos los errores antes de generar el informe
    console.log('Errores antes de generar el informe:', JSON.stringify(result.errors, null, 2));

    // Generar informe HTML
    const htmlFileName = htmlEntry ? htmlEntry.entryName : null;
    const reportHtml = generateReport(result, htmlFileName, reportId);

    // Depuración: Loguear el HTML generado
    console.log('HTML generado para el informe:', reportHtml);

    // Guardar el HTML en un archivo temporal para inspección
    const tempHtmlPath = path.join(reportDir, 'report_temp.html');
    fs.writeFileSync(tempHtmlPath, reportHtml, 'utf8');

    // Escribir el informe final
    fs.writeFileSync(reportPath, reportHtml, 'utf8');

    return { result, reportPath };
  } catch (error) {
    result.errors.push(`Error interno al procesar el banner: ${error.message}`);
    const reportHtml = generateReport(result, null, reportId);
    fs.writeFileSync(reportPath, reportHtml, 'utf8');
    return { result, reportPath };
  }
}

function detectFolder(zip, possibleFolders) {
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const dir = path.dirname(entry.entryName);
    if (possibleFolders.includes(dir)) {
      return dir;
    }
  }
  return '';
}

function generateReport(result, htmlFile, reportId) {
  const criticalErrors = result.errors.filter(err => 
    err.includes('No se encontró un archivo HTML') ||
    err.includes('Falta la metaetiqueta ad.size') ||
    err.includes('No se encontró ningún clickTag') ||
    err.includes('no se utiliza en ningún elemento interactivo') ||
    err.includes('URL del clickTag') ||
    err.includes('Errores en la estructura HTML') ||
    err.includes('Error interno al procesar el banner') ||
    err.includes('La imagen referenciada en') ||
    (err.includes('La carpeta ') && err.includes('especificada en img src=')) ||
    (err.includes('La carpeta ') && err.includes('especificada en background-image url='))
  );
  const status = criticalErrors.length === 0 ? 'Éxito' : 'Fallido';
  const clickTagSummary = result.details.clickTags || [];
  const hasBanner = !!htmlFile;

  let iframeWidth = '100%';
  let iframeHeight = '300px';
  if (result.details.adSize) {
    const sizeMatch = result.details.adSize.match(/width=(\d+),height=(\d+)/);
    if (sizeMatch) {
      iframeWidth = `${sizeMatch[1]}px`;
      iframeHeight = `${sizeMatch[2]}px`;
    }
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Informe de Validación de Banner</title>
      <meta charset="UTF-8">
      <style>
        .error { color: red; }
        .warning { color: orange; }
        .status-éxito { color: green; }
        .status-fallido { color: red; }
      </style>
    </head>
    <body>
      <h1>Informe de Validación de Banner</h1>
      <div class="section">
        <h2>Estado: <span class="status-${status.toLowerCase()}">${escapeHtml(status)}</span></h2>
      </div>
      <div class="section">
        <h3>Detalles</h3>
        <ul>
          <li><strong>Tamaño del ZIP:</strong> ${escapeHtml(result.details.zipSize)}</li>
          <li><strong>Tamaño de la carga inicial:</strong> ${escapeHtml(result.details.initialLoadSize)}</li>
          <li><strong>Metaetiqueta ad.size:</strong> ${escapeHtml(result.details.adSize || 'No encontrada')}</li>
          <li><strong>Clicktags:</strong>
            <ul>
              ${clickTagSummary.map(tag => `
                <li>${escapeHtml(tag.name)}: ${escapeHtml(tag.valid ? 'Válido' : 'Inválido')}
                  (${escapeHtml(tag.urlValid ? 'URL válida' : 'URL inválida')}, ${escapeHtml(tag.used ? 'Usado' : 'No usado')})
                  - URL: ${escapeHtml(tag.url)} (Archivo: ${escapeHtml(tag.file)})
                </li>
              `).join('')}
            </ul>
          </li>
        </ul>
      </div>
      ${result.errors.length > 0 ? `
        <div class="section">
          <h3>Errores</h3>
          <ul>${result.errors.map(err => `<li class="error">${escapeHtml(err)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${result.warnings.length > 0 ? `
        <div class="section">
          <h3>Advertencias</h3>
          <ul>${result.warnings.map(warn => `<li class="warning">${escapeHtml(warn)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${hasBanner ? `
        <div class="section">
          <h3>Vista previa del Banner</h3>
          <iframe src="/reports/${reportId}/${htmlFile}" width="${iframeWidth}" height="${iframeHeight}"></iframe>
        </div>
      ` : `
        <div class="section">
          <p class="error">No se puede mostrar la vista previa del banner debido a la falta de un archivo HTML.</p>
        </div>
      `}
    </body>
    </html>
  `;
}

module.exports = { validateBanner };
