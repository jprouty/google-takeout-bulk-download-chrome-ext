console.log('This is the background page.');

const takeoutFinalUrlRe = new RegExp(/googleusercontent\.com\/download\/storage\/v1\/b\/dataliberation\/o\/(?<timestamp>\d{8}T\d{6})\.\d{3}Z/g);
const takeoutFilenameRe = new RegExp(/takeout-(?<timestamp>\d{8}T\d{6}Z)-(?<part>\d{3})\.(?<ext>zip|tgz)/g);

// Look for the newly initiated download and grab the timestamp prefix.
chrome.downloads.onCreated.addListener(dlItem => {
    console.log("downloads.onCreated", dlItem);
    // for (const match of dlItem.filename.matchAll(takeoutFilenameRe)) {
    //     console.log("We have a takeout download!");
    //     console.log(`Timestamp: ${match.groups.timestamp} Part: ${match.groups.part} Ext: ${match.groups.ext}`);
    // }
});

let onDlChanged = async (delta) => {
    console.log('onChanged', delta);

    // Look for a filename delta, which happens once the download starts.
    if (delta.filename) {
        for (const match of delta.filename.current.matchAll(takeoutFilenameRe)) {
            console.log("We have a takeout download!");
            console.log(`Timestamp: ${match.groups.timestamp} Part: ${match.groups.part} Ext: ${match.groups.ext}`);

            let downloads = await chrome.storage.local.get();
            // Save off the prefix so we can match up with others from the same batch.
            if (!downloads.batchTimestamp) {
                downloads.batchTimestamp = match.groups.timestamp;

                // TODO: See if there are additional completed downloads via chrome.downloads.search!
            }

            // Associate the download id with the part.
            const partIdx = match.groups.part - 1;
            downloads.parts[partIdx].downloadId = delta.id;
            downloads.parts[partIdx].state = "in_progress";
            downloads.isDownloading = true;
            downloads.downloadIdToPartIdx[delta.id] = partIdx;
            await chrome.storage.local.set(downloads);

            return;
        }
    }

    // Look for downloads that are finishing.
    if (delta.state && delta.state.current === "complete") {
        let downloads = await chrome.storage.local.get();
        // Remove the completed download form the active set of downloads.
        if (downloads.downloadIdToPartIdx[delta.id]) {
            const partIdx = downloads.downloadIdToPartIdx[delta.id];
            console.log(`Part ${partIdx + 1} complete.`)
            delete downloads.downloadIdToPartIdx[delta.id];
            downloads.parts[partIdx].state = "complete";

            console.log(downloads);
            await chrome.storage.local.set(downloads);
        }
    }

    // TODO: Look for other failure states.
};

chrome.downloads.onChanged.addListener(onDlChanged);

let startDownload = async (request) => {
    console.log('startDownload');
    console.log(request.downloads);
    await chrome.storage.local.set({
        isDownloading: true,
        parts: request.downloads,
        downloadIdToPartIdx: {},
    });

    // Next:
    // 1) (Maybe) Go through existing downloads to see progress
    // 2) Determine next download. Send back via startNextDownloadUrl
    return {
        success: true,
        startNextDownloadUrl: request.downloads[4].url,
    };
}

let downloadStatus = async (request) => {
    console.log('downloadStatus');
    let downloads = await chrome.storage.local.get();
    console.log(downloads);

    // Next:
    // 1) Compute per chunk progress
    // 2) Compute total progress (and if done!?)
    // 3) Determine if another dl should start
    return {
        isDownloading: !!downloads.isDownloading,
        startNextDownloadUrl: await getNextDownloadUrl(downloads),
    };
}

let getNextDownloadUrl = async (downloads) => {
    return null;
}

// Return true to indicate an asynchronous response.
chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        if (request.action === "START_BULK_DL") {
            startDownload(request).then(sendResponse);
            return true;
        } else if (request.action === "BULK_DL_STATUS") {
            downloadStatus(request).then(sendResponse);
            return true;
        }
        console.warn(`Unrecognized message action: ${request.action}`);
        return false;
    }
);

// chrome.downloads.search({}).then(downloads => {
//     console.log('Printing Downloads ' + new Date());
//     downloads.forEach(function (item, i) {
//         console.log(item);
//     });
// });