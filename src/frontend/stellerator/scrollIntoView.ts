import { Ports } from '../elm/Stellerator/Main.elm';

class Task {
    constructor(private _id: string, private _timeout = 100) {}

    start(): void {
        setTimeout(() => this._observer.disconnect(), this._timeout);

        this._observer.observe(document.body, {
            attributes: false,
            characterData: false,
            childList: true,
            subtree: true
        });
    }

    private _onMutation = (mutations: Array<MutationRecord>): void => {
        if (!mutations.find(m => m.addedNodes)) {
            return;
        }

        const node = document.getElementById(this._id);

        if (node) {
            this._observer.disconnect();
            clearTimeout(this._timeoutHandle);

            node.scrollIntoView({ block: 'center' });
        }
    };

    private _observer = new MutationObserver(this._onMutation);
    private _timeoutHandle: any = null;
}

export function initSrollIntoView(ports: Ports): void {
    ports.scrollIntoView.subscribe((id: string) => {
        const node = document.getElementById(id);

        if (node) {
            node.scrollIntoView({ block: 'center' });
        } else {
            new Task(id).start();
        }
    });
}