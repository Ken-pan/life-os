.pragma library
var origin = 0;
function start(event) {
    origin = Date.now();
    console.log("NAV_TRACE +0ms " + event);
}
function mark(event) {
    if (origin === 0) return;
    console.log("NAV_TRACE +" + (Date.now() - origin) + "ms " + event);
}
