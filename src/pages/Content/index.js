import { printDownloads } from './modules/print';

const downloadPartRe = new RegExp(/Part (?<part>[\d]+) of (?<parts>[\d]+) \((?<size>[\d\.]+) (?<size_unit>[KMGT]?B)\)/g);

let sizeAsBytes = (size, unit) => {
    let unitMulti = 1;
    switch (unit) {
        case 'KB':
            unitMulti = 1024;
            break;
        case 'MB':
            unitMulti = 1024 * 1024;
            break;
        case 'GB':
            unitMulti = 1024 * 1024 * 1024;
            break;
        case 'TB':
            unitMulti = 1024 * 1024 * 1024 * 1024;
            break;
        default:
            unitMulti = 1;
            break;
    }
    return size * unitMulti;
}

let showStatusInDialog = async (dialogNode) => {
    let status = await chrome.runtime.sendMessage({ action: 'BULK_DL_STATUS' });
    if (!status) return false;
    if (!status.isDownloading) return false;

    // Start the next download if instructed to do so.
    if (status.startNextDownloadUrl) {
        console.log("Starting next part download");
        location.href = status.startNextDownloadUrl;
        return true;
    }

    // First try to find the existing status node.
    let statusNode = document.getElementById('bulk-download-status');

    // Otherwise, create one.
    if (!statusNode) {
        statusNode = document.createElement('div');
        statusNode.id = 'bulk-download-status';

        let dialogTextSearch = document.evaluate(".//div[contains(text(), \"Since this export is too big for a single file\")]", dialogNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (!dialogTextSearch.singleNodeValue) {
            console.error('Cannot find the dialog text.');
            return true;
        }
        const dialogTextNode = dialogTextSearch.singleNodeValue;
        dialogTextNode.parentNode.insertBefore(statusNode, dialogTextNode.nextSibling);
    }

    // Update with the latest status.
    statusNode.innerHTML = status.statusString;
    setTimeout(showStatusInDialog, 1000);
    return true;
}

let decorateDialogWithBulkDownload = async (searchNode) => {
    let dialogSearch = document.evaluate(".//div[@role=\"dialog\"]", searchNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    let dialogNode = dialogSearch.singleNodeValue;
    if (!dialogNode) return;

    const isDownloading = await showStatusInDialog(dialogNode);
    if (isDownloading) return;

    let tableRowsSearch = document.evaluate(".//table//tbody/tr", dialogNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    let tableRowNode = tableRowsSearch.iterateNext();
    let downloads = []
    while (tableRowNode) {
        let downloadLinksSearch = document.evaluate(".//a[@aria-label=\"Download\"]", tableRowNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        let firstDownloadLinkNode = downloadLinksSearch.iterateNext();
        if (!firstDownloadLinkNode) break;

        const downloadPiece = tableRowNode.childNodes[2].childNodes[0].textContent;
        for (const match of downloadPiece.matchAll(downloadPartRe)) {
            downloads.push({
                part: match.groups.part,
                parts: match.groups.parts,
                size: sizeAsBytes(match.groups.size, match.groups.size_unit),
                url: window.location.origin + '/' + firstDownloadLinkNode.getAttribute('href'),
            });
        }
        tableRowNode = tableRowsSearch.iterateNext();
    }

    // Add bulk download button.
    let dialogTextSearch = document.evaluate(".//div[contains(text(), \"Since this export is too big for a single file\")]", dialogNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    if (!dialogTextSearch.singleNodeValue) return;
    const dialogTextNode = dialogTextSearch.singleNodeValue;

    const button = document.createElement('button');
    button.textContent = 'Download All';
    button.addEventListener('click', (event) => {
        button.disabled = true;
        chrome.runtime.sendMessage({ action: 'START_BULK_DL', downloads }).then(response => {
            if (response.startNextDownloadUrl) {
                // Start the first download, which will likely require user auth. Afterwards, the service worker will take over, assuming it can keep the session live.
                location.href = response.startNextDownloadUrl;
            } else {
                button.remove();
                showStatusInDialog(dialogNode);
            }
        });
    });
    dialogTextNode.parentNode.insertBefore(button, dialogTextNode.nextSibling);
}

let observer = new MutationObserver(mutations => {
    for (let mutation of mutations) {
        for (let addedNode of mutation.addedNodes) {
            decorateDialogWithBulkDownload(addedNode);
        }
    }
});
observer.observe(document, { childList: true, subtree: true });
decorateDialogWithBulkDownload(document);