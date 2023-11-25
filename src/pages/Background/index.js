console.log('This is the background page.');


chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        if (request.action === "START_BULK_DL") {
            console.log(request.downloadUrls);
            // chrome.downloads.download({ url: request.downloadUrls[0] }).then(downloadId => {
            //     console.log("Started download " + downloadId);
            // })
            sendResponse({ status: "ACK" });
        }
    }
);


// chrome.downloads.search({}).then(downloads => {
//     console.log('Printing Downloads ' + new Date());
//     downloads.forEach(function (item, i) {
//         console.log(item);
//     });
// });