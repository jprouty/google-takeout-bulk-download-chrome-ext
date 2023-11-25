console.log('This is the background page.');

let startDownload = async (request) => {
    console.log('startDownload');
    console.log(request.downloads);
    await chrome.storage.local.set({ bulkDownloads: request.downloads });

    chrome.downloads.onCreated.addListener(dlItem => {
        console.log("downloads.onCreated");
        console.log(dlItem);
    });

    // chrome.downloads.download({ url: request.downloads[3].url }).then(downloadId => {
    //     console.log("Started download " + downloadId);
    // })
    return { success: true };
}

let downloadStatus = async (request) => {
    console.log('downloadStatus');
    let downloads = await chrome.storage.local.get('bulkDownloads');
    return { isDownloading: !!downloads };
}

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        if (request.action === "START_BULK_DL") {
            startDownload(request).then(response => sendResponse(response));
        } else if (request.action === "BULK_DL_STATUS") {
            downloadStatus(request).then(response => {
                console.log('status response: ');
                console.log(response);
                sendResponse(response);
            });
        }
    }
);

// chrome.downloads.search({}).then(downloads => {
//     console.log('Printing Downloads ' + new Date());
//     downloads.forEach(function (item, i) {
//         console.log(item);
//     });
// });