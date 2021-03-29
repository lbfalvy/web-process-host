importScripts("ipc.js")

addEventListener('message', ev => console.log('Worker incoming', ev.data))
async function main() 
{
    const port = await getSubChannel(this);
    const client = await getClient(port);
    console.log('Worker got client')
    await client.show(["http://example.com"]);
    console.log("Yeee-");
    console.log("-haw!", await client.w81sec());
    console.log('Client', client);
}
main();