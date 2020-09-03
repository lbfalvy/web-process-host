async function load_and_eval(script) {
    const res = await fetch(script);
    const string = await res.text();
    return await eval(string);
}

load_and_eval("./message_bus.js").then( module => {
    module.sendToRoot("beep, I'm a worker");
});