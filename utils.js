/**
 * Open the specified url in the specified frame, and post it the message and
 * transfer as soon as it loads
 * @param {HTMLIFrameElement} frame 
 * @param {string} url 
 * @param {any} message 
 * @param {Transferable[]} transfer 
 */
function show(frame, url, message, transfer) {
    frame.setAttribute('src', url);
    frame.addEventListener('load', ev => {
        frame.contentWindow.postMessage(message, '*', transfer);
    });
}