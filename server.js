const express = require('express');
const multer = require('multer');
const path = require('path');
const { validateBanner } = require('./src/validator');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

app.post('/validate', upload.array('banners'), async (req, res) => {
  console.log('Recibida solicitud POST /validate');
  console.log('req.files:', req.files);

  try {
    const results = [];
    for (const file of req.files) {
      console.log(`Validando archivo: ${file.originalname}`);
      const { result, reportPath } = await validateBanner(file.buffer);
      const reportHtml = require('fs').readFileSync(reportPath, 'utf8');
      results.push({
        fileName: file.originalname,
        reportHtml,
        result,
      });
    }
    res.json(results);
  } catch (error) {
    console.error('Error en la validación:', error);
    res.status(500).json([{ fileName: 'N/A', error: error.message }]);
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});