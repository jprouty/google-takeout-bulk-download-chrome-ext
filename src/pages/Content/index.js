import { printDownloads } from './modules/print';

console.log('Content script loaded! 9');


let observer = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        for (let addedNode of mutation.addedNodes) {
            let dialogSearch = document.evaluate(".//div[@role=\"dialog\"]", addedNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            let dialogNode = dialogSearch.singleNodeValue;
            if (dialogNode) {
                console.log("New dialog found", dialogNode);
                let downloadLinksSearch = document.evaluate(".//a[@aria-label=\"Download\"]", dialogNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let node = downloadLinksSearch.iterateNext();
                while (node) {
                    console.log(node);
                    node = downloadLinksSearch.iterateNext();
                }
            }
        }
    }
});
observer.observe(document, { childList: true, subtree: true });

