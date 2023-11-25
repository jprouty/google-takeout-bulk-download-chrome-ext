import { printDownloads } from './modules/print';

console.log('Content script loaded! 9');

let observer = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        for (let addedNode of mutation.addedNodes) {
            let dialogSearch = document.evaluate(".//div[@role=\"dialog\"]", addedNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            let dialogNode = dialogSearch.singleNodeValue;
            if (dialogNode) {
                // console.log("New dialog found", dialogNode);
                let downloadLinksSearch = document.evaluate(".//a[@aria-label=\"Download\"]", dialogNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let node = downloadLinksSearch.iterateNext();
                let downloadUrls = []
                while (node) {
                    if (node.checkVisibility()) {
                        // console.log(node);
                        downloadUrls.push(window.location.origin + '/' + node.getAttribute('href'));
                    }
                    node = downloadLinksSearch.iterateNext();
                }
                // console.log(downloadUrls);

                // Add bulk download button
                let dialogTextSearch = document.evaluate(".//div[contains(text(), \"Since this export is too big for a single file\")]", dialogNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                console.log(dialogTextSearch.singleNodeValue);
                if (!dialogTextSearch.singleNodeValue) return;
                const dialogTextNode = dialogTextSearch.singleNodeValue;

                const button = document.createElement('button');
                button.textContent = 'Download All';
                button.addEventListener('click', (event) => {
                    console.log('On click mofo');
                    button.disabled = true;
                    chrome.runtime.sendMessage({ action: 'START_BULK_DL', downloadUrls }).then(response => {
                        console.log(response);

                        const status = document.createElement('span');
                        status.textContent = 'Downloading - 0%';

                        dialogTextNode.parentNode.removeChild(button);
                        dialogTextNode.parentNode.insertBefore(status, dialogTextNode.nextSibling);
                    });
                });
                dialogTextNode.parentNode.insertBefore(button, dialogTextNode.nextSibling);
            }
        }
    }
});
observer.observe(document, { childList: true, subtree: true });

