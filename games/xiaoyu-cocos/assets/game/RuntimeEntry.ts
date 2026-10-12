import { Application } from './Application';
// Loading depends on this registration only after the code bundle is loaded.
(globalThis as any).LittleStepsRuntime = {create:(canvas:any)=>new Application(canvas)};
