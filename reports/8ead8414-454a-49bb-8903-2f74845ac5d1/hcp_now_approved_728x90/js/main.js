var _loadedImages = 0,
	_imageArray = new Array('bgf1.png','bgf3.png','bgf5.png','bgf6.png','cta_arrow.png','cta.png','f1txt1.png','f2txt1.png','f3txt1.png','f4txt1.png','f5txt1.png','logo.png'),
	_tl,
	_isiText = document.getElementById('isi-text'),
	_container = document.getElementById('isi'),
	_isiControls = document.getElementById('isi-controls'),
	_scrollForMore = document.getElementById('scrollForMore'),
	_scrollerBeingDragged = false,
	_scroller,
	_scrollerline,
	_arrowUp,
	_arrowDown,
	_normalizedPosition,
	_topPosition,
	_contentPosition = 0,
	_percentY,
	_textScrollHeight,
	_isiFullTime,
	_isiFullHeight;

this.addEventListener('DOMContentLoaded', preloadImages);

function preloadImages() {
    for (var i = 0; i < _imageArray.length; i++) {
        var _tempImage = new Image();
        _tempImage.addEventListener('load', trackProgress);
        _tempImage.src = 'img/'+_imageArray[i];
    }
}

function trackProgress(){
    _loadedImages++;
    if(_loadedImages == _imageArray.length) loadGSPA();
}

function loadGSPA(){
    ipGSPA = document.createElement('script');
    ipGSPA.setAttribute('type', 'text/javascript');
    ipGSPA.setAttribute('src', 'https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js');
    document.getElementsByTagName('head')[0].appendChild(ipGSPA);

    ipGSPA.addEventListener('load', loadSTP, false);
}

function loadSTP(){
    ipSTP = document.createElement('script');
    ipSTP.setAttribute('type', 'text/javascript');
    ipSTP.setAttribute('src', 'https://s0.2mdn.net/ads/studio/cached_libs/scrolltoplugin_3.2.4_min.js');
    document.getElementsByTagName('head')[0].appendChild(ipSTP);

    ipSTP.addEventListener('load', init, false);
}

function init() {
	var css = document.createElement('link');
	css.setAttribute( 'rel', 'stylesheet' );
	css.setAttribute( 'type', 'text/css' );
	css.setAttribute( 'href', 'css/style.css' );
	document.getElementsByTagName('head')[0].appendChild(css);

	//***** Start - Scroll creation and events registering
	createScroll(false, true);

	_tl = gsap.timeline();

	css.addEventListener('load', initAnimations, false);
}

function initAnimations() {
	console.time('animationTotalTime');
	console.time('TotalTime');
	
	_isiFullHeight = _isiText.scrollHeight;
	_isiFullTime = _isiFullHeight / 10;

	FRAME_1();

	function FRAME_1() {
		gsap.to('.banner', { duration: .3,  opacity:1 });
		gsap.to('#f1txt1', { duration: .4,  x: 80, opacity: 1, ease:'power1.out' });

		gsap.delayedCall( 2.5, FRAME_2)
	}

	function FRAME_2() {
		gsap.to(['#f1txt1', '#bgf1', '#bgf2'], { duration: .5,  x: -488, ease:'power1.out'});
		gsap.to('#f2txt1', { duration: .5, x: -304, ease:'power1.out', delay: .2 });

		gsap.delayedCall( 2.8, FRAME_3)
	}

	function FRAME_3() {
		gsap.to(['#f2txt1', '#bgf2'], { duration: .5,  opacity: 0 });
		gsap.to('#bgf3', { duration: .5, y: 170, ease:'power1.out' });

		gsap.delayedCall( 3, FRAME_4)
	}

	function FRAME_4() {
		gsap.to('#bgf3', { duration: .4, y: 275, ease:'power1.out' });
		gsap.to('#f3txt1', { duration: .3, opacity: 0 });
		gsap.to('#f4txt1', { duration: .5, opacity: 1, delay: .4 });
		gsap.to('#bgf5', { duration: .5, y: 15, ease:'power1.out', delay: .4 });

		gsap.delayedCall( 3.2, FRAME_5)
	}

	function FRAME_5() {
		gsap.to('#bgf5', { duration: .6, y: 326, ease:'power1.out' });
		gsap.to('#f4txt1', { duration: .6, opacity: 0, delay: .2 });

		gsap.delayedCall( 2, FRAME_6)
	}

	function FRAME_6() {
		gsap.to('#f5txt1', { duration: .5, x: -122, ease:'power1.out' });
		gsap.to('#bg_cta', { duration: .5, y: -146, ease:'power1.out', delay: .4 });
		gsap.to(['#cta','#cta_arrow'], { duration: .6, opacity: 1, delay: 1 });

		gsap.delayedCall( 2.2, overButton)

		_tl
		.addLabel('autoISI')
		.to(_isiText, { duration: _isiFullTime, scrollTo: { y: _isiFullHeight }, ease: 'none' },'+=1.7');
		_tl.seek('autoISI');
	}
}

function overButton() {
	elem('#cta_btn').addEventListener('mouseover', function () {
		gsap.to('#cta_arrow', { duration: .25, x: 0 + 4, ease:'power1.out' });
	});
	elem('#cta_btn').addEventListener('mouseout', function () {
		gsap.to('#cta_arrow', { duration: .25, x: 0, ease:'power1.out' });
	});
}

function timeStamps(frame) { console.timeLog('animationTotalTime', '<= ' + frame); }

function elem(id) { return document.querySelector(id); }

//***** Scrolling functions *****//
function createScroll(hasArrows, hasScroller) {
	//***** Scrolling function - Creation(init)
	hasArrows = typeof hasArrows !== 'undefined' ? hasArrows : true;
	hasScroller = typeof hasScroller !== 'undefined' ? hasScroller : true;
	if (hasArrows) {
		_arrowUp = document.createElement('div');
		_arrowUp.id = 'arrowUp';
		_arrowUp.className = 'retina';
		_isiControls.appendChild(_arrowUp);
	}

	if (hasScroller) {
		_scrollerline = document.createElement('div');
		_scrollerline.className = hasArrows ? 'isiLineWithArrows' : 'isiLineNoArrows';
		_isiControls.appendChild(_scrollerline);

		_scroller = document.createElement('div');
		_scroller.className = 'scroller';
		_scrollerline.appendChild(_scroller);
	}

	if (hasArrows) {
		_arrowDown = document.createElement('div');
		_arrowDown.id = 'arrowDown';
		_arrowDown.className = 'retina';
		_isiControls.appendChild(_arrowDown);
	}

	//Listeners
	if (hasScroller) {
		_isiText.addEventListener('scroll', moveScroller);

		_scroller.addEventListener('mousedown', startDrag);
		_scroller.addEventListener('mouseout', seekListenerBack);
		_scrollerline.addEventListener('click', seekTo);

		window.addEventListener('mousemove', scrollBarScroll);
	}

	if (hasArrows) {
		_arrowUp.addEventListener('mousedown', scrollUp);
		_arrowDown.addEventListener('mousedown', scrollDown);
		_arrowUp.addEventListener('mouseup', scrollStop);
		_arrowDown.addEventListener('mouseup', scrollStop);
	}

	_isiText.addEventListener('wheel', scrollStop);
	window.addEventListener('mouseup', stopDrag);
}

function touchHandler(event) {
	var touch = event.changedTouches[0];
	var simulatedEvent = document.createEvent('MouseEvent');
	simulatedEvent.initMouseEvent(
		{
			touchstart: 'mousedown',
			touchmove: 'mousemove',
			touchend: 'mouseup',
		}[event.type],
		true,
		true,
		window,
		1,
		touch.screenX,
		touch.screenY,
		touch.clientX,
		touch.clientY,
		false,
		false,
		false,
		false,
		0,
		null
	);
	touch.target.dispatchEvent(simulatedEvent);
}

function seekListenerBack() {
	_scrollerline.addEventListener('click', seekTo);
}

function seekTo(evt) {
	//***** Scrolling function - Seeks to an specific point
	var normalPosition = (evt.clientY - _isiControls.offsetParent.offsetTop - _scrollerline.offsetTop) / _scrollerline.clientHeight;
	_textScrollHeight = _isiText.scrollHeight - _container.offsetHeight; //gets the text height(offset) to scroll
	_isiText.scrollTop = normalPosition * _textScrollHeight;
	scrollStop();
}

function startDrag(evt) {
	//***** Scrolling function - Starts dragging when holds scroller button
	_scrollerline.removeEventListener('click', seekTo);
	_normalizedPosition = evt.clientY - _scrollerline.scrollTop;
	_contentPosition = _isiText.scrollTop;
	_scrollerBeingDragged = true;
	scrollStop();
}

function stopDrag(evt) {
	//***** Scrolling function - Stops dragging when releases scroller button
	if (typeof buttonPress != 'undefined' && buttonPress) scrollStop(buttonPress);
	_scrollerBeingDragged = false;
}

function scrollBarScroll(evt) {
	//***** Scrolling function - Moves text up/down
	evt.preventDefault();
	if (_scrollerBeingDragged === true) {
		var mouseDifferential = evt.clientY - _normalizedPosition;
		var scrollEquivalent = mouseDifferential * (_isiText.scrollHeight / _scrollerline.clientHeight);
		_isiText.scrollTop = _contentPosition + scrollEquivalent;
	}
}

function moveScroller(evt) {
	//***** Scrolling function - Moves scroller button up/down
	evt.preventDefault();
	_textScrollHeight = _isiText.scrollHeight - _container.offsetHeight; //gets the text height(offset) to scroll
	var remainOffsetHieght = _textScrollHeight - _isiText.scrollTop; //when scrolling,it gets the remaining height(top offset)
	var percentHeigh = 1 - remainOffsetHieght / _textScrollHeight; //transform to a percentage
	_scroller.style.top = Math.abs((_scrollerline.offsetHeight - _scroller.offsetHeight) * percentHeigh) + 'px'; //To equivalent scroller line height
}

function scrollUp() {
	//***** Scrolling function - Sets text a step up
	console.log('up');
	scrollStop();
	buttonPress = setInterval(function () {
		_isiText.scrollTop -= scrollStep;
	}, 100);
}

function scrollDown() {
	//***** Scrolling function - Sets text a step down
	console.log('down');
	scrollStop();
	buttonPress = setInterval(function () {
		_isiText.scrollTop += scrollStep;
	}, 100);
}

function scrollStop() {
	//***** Scrolling function - Clears buttons interval
	_tl.killTweensOf(_isiText);
}