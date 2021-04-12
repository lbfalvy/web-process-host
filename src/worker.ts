import { getSubChannel, getClient, isMessageTarget, } from './ipc'
import { ProcessAPI } from './types';

addEventListener('message', ev => console.log('Worker incoming', ev.data))
async function main(this: DedicatedWorkerGlobalScope)
{
    const port = getSubChannel(this);
    const client = await getClient<ProcessAPI>(port);
    console.log('Worker got client')
    await client.show(["http://example.com"]);
    console.log("Yeee-");
}

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
if (!isMessageTarget(scope)) throw new Error('Not a worker!');
main.apply(scope);