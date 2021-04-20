import { getSubChannel, getClient, isMessageTarget, } from './ipc'
import { ProcessAPI } from './types';

addEventListener('message', ev => console.log('Worker incoming', ev.data))
async function main(this: DedicatedWorkerGlobalScope)
{
    const port = getSubChannel(this);
    const client = await getClient<ProcessAPI>(port);
    console.log('Worker got client')
    const initialTitle = await client.getTitle();
    console.log('Old Title:', initialTitle);
    await client.setTitle(['Title set by call']);
    console.log('Should say "Title set by call":', client.Title);
    await client.show(["http://example.com"]);
    console.log("Yeee-");
}

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
if (!isMessageTarget(scope)) throw new Error('Not a worker!');
main.apply(scope);