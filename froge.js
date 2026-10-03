// Froge hero: draggable period + background bursts.
// Two separate event systems. Pointer Events only for the period; click only for bursts.
(function () {
  "use strict";

  var BLOB = "M42 4C60 6 96 22 97 48C98 62 80 96 50 97C28 98 2 80 3 56C4 40 22 2 42 4Z";
  var SEA = "#a6e3d0";
  var ORANGE = "#f25c33";

  var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(reduceQuery && reduceQuery.matches); }

  /* ---------------- 1. Draggable period ---------------- */

  var hit = document.querySelector(".froge-period-hit");
  var white = document.querySelector(".layer-white");
  var sea = document.querySelector(".layer-sea");
  var orange = document.querySelector(".layer-orange");

  if (hit && white && sea && orange) {
    // Each layer is a damped spring holding a displacement (px) from its exact
    // resting place. Resting offsets live in the SVG itself, so 0 = brand position.
    // While dragging, the copies trail the white blob by a lag that grows with
    // drag distance and eases toward a cap (a fraction of the period's size), so
    // the sea foam / orange separation stretches but stays attached to the period.
    var layers = [
      { el: white,  lag: 0.00, cap: 0.00, freq: 17.0, x: 0, y: 0, vx: 0, vy: 0 },
      { el: sea,    lag: 0.30, cap: 0.58, freq: 15.0, x: 0, y: 0, vx: 0, vy: 0 },
      { el: orange, lag: 0.26, cap: 0.46, freq: 13.5, x: 0, y: 0, vx: 0, vy: 0 }
    ];
    var dotEl = hit.parentNode;
    var dotSize = 40;
    function goal(l) {
      var d = Math.sqrt(targetX * targetX + targetY * targetY);
      if (!l.lag || d === 0) return [targetX, targetY];
      var cap = l.cap * dotSize;
      var lag = cap * Math.tanh(d * l.lag / cap);
      return [targetX - targetX / d * lag, targetY - targetY / d * lag];
    }
    var DRAG_ZETA = 0.8;    // tight follow while held
    var RETURN_ZETA = 0.6;  // ~10% overshoot on release

    var dragging = false;
    var pointerId = null;
    var startPointerX = 0, startPointerY = 0;
    var targetX = 0, targetY = 0;
    var rafId = 0, lastT = 0;

    // Soft tether: movement gets heavier the farther it is pulled.
    function tether(dx, dy) {
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) return [0, 0];
      var reach = Math.max(window.innerWidth, window.innerHeight) * 0.6;
      var k = 1 / (1 + d / reach);
      return [dx * k, dy * k];
    }

    function apply(l) {
      l.el.style.transform = (l.x === 0 && l.y === 0) ? "" :
        "translate3d(" + l.x.toFixed(2) + "px," + l.y.toFixed(2) + "px,0)";
    }

    function step(t) {
      rafId = 0;
      var dt = Math.min((t - lastT) / 1000, 1 / 20);
      lastT = t;
      var zeta = dragging ? DRAG_ZETA : RETURN_ZETA;
      var settled = true;
      var sub = Math.max(1, Math.ceil(dt / (1 / 240)));
      var h = dt / sub;
      for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        var g = dragging ? goal(l) : [0, 0];
        var gx = g[0], gy = g[1];
        var w = l.freq, k = w * w, c = 2 * zeta * w;
        for (var s = 0; s < sub; s++) {
          l.vx += (k * (gx - l.x) - c * l.vx) * h;
          l.vy += (k * (gy - l.y) - c * l.vy) * h;
          l.x += l.vx * h;
          l.y += l.vy * h;
        }
        if (!dragging && Math.abs(l.x) < 0.2 && Math.abs(l.y) < 0.2 &&
            Math.abs(l.vx) < 4 && Math.abs(l.vy) < 4) {
          l.x = l.y = l.vx = l.vy = 0; // exact home
        } else {
          settled = false;
        }
        apply(l);
      }
      if (!settled || dragging) rafId = requestAnimationFrame(step);
    }

    function kick() {
      if (!rafId) {
        lastT = performance.now();
        rafId = requestAnimationFrame(step);
      }
    }

    // Reduced motion: layers follow directly, release eases home with no overshoot.
    var easeAnim = null;
    function placeDirect() {
      for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        var g = goal(l);
        l.x = g[0]; l.y = g[1]; l.vx = l.vy = 0;
        apply(l);
      }
    }
    function easeHome() {
      var from = layers.map(function (l) { return [l.x, l.y]; });
      var t0 = performance.now(), dur = 180;
      function frame(now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - (1 - p) * (1 - p);
        for (var i = 0; i < layers.length; i++) {
          var l = layers[i];
          l.x = p === 1 ? 0 : from[i][0] * (1 - e);
          l.y = p === 1 ? 0 : from[i][1] * (1 - e);
          apply(l);
        }
        easeAnim = p < 1 ? requestAnimationFrame(frame) : null;
      }
      easeAnim = requestAnimationFrame(frame);
    }

    hit.addEventListener("pointerdown", function (event) {
      if (dragging) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId;
      dotSize = dotEl.getBoundingClientRect().width || dotSize;
      // Continue from wherever the period currently is (mid-spring grabs stay smooth).
      startPointerX = event.clientX - layers[0].x;
      startPointerY = event.clientY - layers[0].y;
      if (easeAnim) { cancelAnimationFrame(easeAnim); easeAnim = null; }
      try { hit.setPointerCapture(event.pointerId); } catch (_) {}
      hit.classList.add("is-dragging");
      event.preventDefault();
      targetX = layers[0].x; targetY = layers[0].y;
      if (!reduced()) kick();
    });

    hit.addEventListener("pointermove", function (event) {
      if (!dragging || event.pointerId !== pointerId) return;
      var t = tether(event.clientX - startPointerX, event.clientY - startPointerY);
      targetX = t[0]; targetY = t[1];
      if (reduced()) placeDirect(); else kick();
    });

    function finishDrag(event) {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;
      try { if (hit.hasPointerCapture(pointerId)) hit.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      hit.classList.remove("is-dragging");
      if (reduced()) easeHome(); else kick();
    }

    hit.addEventListener("pointerup", finishDrag);
    hit.addEventListener("pointercancel", finishDrag);
    hit.addEventListener("lostpointercapture", finishDrag);
  }

  /* ---------------- 2. Background bursts ---------------- */

  var main = document.querySelector("main");
  var layer = document.querySelector(".bursts");
  var NS = "http://www.w3.org/2000/svg";
  var count = 0;
  var MAX_LIVE = 6;

  function burst(x, y) {
    var color = count % 2 === 0 ? SEA : ORANGE;
    count++;
    var size = Math.round(Math.min(560, Math.max(220, Math.min(window.innerWidth, window.innerHeight) * 0.5)));
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "burst");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.style.left = (x - size / 2) + "px";
    svg.style.top = (y - size / 2) + "px";
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", BLOB);
    path.setAttribute("fill", color);
    svg.appendChild(path);
    layer.appendChild(svg);
    while (layer.childNodes.length > MAX_LIVE) layer.removeChild(layer.firstChild);

    var anim;
    if (reduced()) {
      anim = svg.animate([
        { opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }
      ], { duration: 600, easing: "linear", fill: "forwards" });
    } else {
      // grow 0-58%, hold to 75%, retract into the click point
      anim = svg.animate([
        { transform: "scale(0.14)", offset: 0, easing: "cubic-bezier(.16,1,.3,1)" },
        { transform: "scale(1)", offset: 0.58 },
        { transform: "scale(1)", offset: 0.75, easing: "cubic-bezier(.6,0,.9,.4)" },
        { transform: "scale(0)", offset: 1 }
      ], { duration: 900, fill: "forwards" });
    }
    anim.onfinish = function () { if (svg.parentNode) svg.parentNode.removeChild(svg); };
  }

  if (main && layer && typeof Element.prototype.animate === "function") {
    // Only open hero space: the click must land on <main> itself, never on the
    // wordmark, the period, the footer, links or any other element.
    main.addEventListener("click", function (event) {
      if (event.target !== main) return;
      burst(event.clientX, event.clientY);
    });
  }
})();
