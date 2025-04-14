# Simpler solution to EventListeners

EventListeners usually require a callback approach to listening for some event to occur, which makes working with them painful. Gingersnap solves this by introducing **FutureEvent**. This allows you to use futures to 'wait' on an event to be 'set'. FutureEvent can be cleared to reset the state.

```ts
import {FutureEvent} from "gingersnap/synchronize";
import {Future} from "gingersnap/future";


const event = new FutureEvent();

async function waiting1() {
    console.log('1: Waiting for some event to occur')

    // blocks and wait for the event to occur if it hasn't be triggered as yet
    await event.wait();
    console.log('1: Event completed')
}

async function waiting2() {
    console.log('2: Waiting for some event to occur no more than 100 milliseconds')
    await event.wait({milliseconds: 100});
    console.log('2: Event completed')
}

Future.sleep({seconds: 4}).thenApply(() => event.set()).schedule();

Future.collectSettled([
    Future.wrap(waiting1()),
    Future.wrap(waiting2()),
]).thenApply(() => {
    // resets the event which will block again when a code calls wait()
    event.clear();
}).schedule();
```

This outputs
```bash
1: Waiting for some event to occur
2: Waiting for some event to occur no more than 100 milliseconds
1: Event completed

```

From the output you will notice there is no "2: Event completed", as function exited due to TimeoutError