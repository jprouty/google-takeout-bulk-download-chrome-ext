console.log('This is the background page.');

const takeoutFinalUrlRe = new RegExp(/googleusercontent\.com\/download\/storage\/v1\/b\/dataliberation\/o\/(?<timestamp>\d{8}T\d{6})\.\d{3}Z/g);
const takeoutFilenameRe = new RegExp(/takeout-(?<timestamp>\d{8}T\d{6}Z)-(?<part>\d{3})\.(?<ext>zip|tgz)/g);

// BUG: Filename of drive files that exceed the download part size selection will come raw dawg, like an mp4.
// Must match ahead of time at download creation time, based on the takeoutFinalUrlRe.

// Look for the newly initiated download and grab the timestamp prefix.
let onDlCreated = async dlItem => {
    console.log("downloads.onCreated", dlItem);
    for (const match of dlItem.finalUrl.matchAll(takeoutFinalUrlRe)) {
        console.log("We have a takeout download!");
        console.log(`Timestamp: ${match.groups.timestamp}`);
        let downloads = await chrome.storage.local.get();
        if (!downloads.batchTimestamp) {
            downloads.batchTimestamp = match.groups.timestamp;

            // TODO: See if there are additional completed downloads via chrome.downloads.search!
        }
    }
};

let onDlChanged = async delta => {
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

// Look for the newly initiated download and grab the timestamp prefix.
chrome.downloads.onCreated.addListener(onDlCreated);
chrome.downloads.onChanged.addListener(onDlChanged);

let startDownload = async (request) => {
    console.log('startDownload');
    await chrome.storage.local.set({
        isDownloading: true,
        parts: request.downloads,
        coolDown: 10,
        downloadIdToPartIdx: {},
    });

    return {
        success: true,
        startNextDownloadUrl: request.downloads[0].url,
    };
}

let downloadStatus = async (request) => {
    let downloads = await chrome.storage.local.get();
    if (!downloads.parts) return { isDownloading: false };
    return { isDownloading: false };

    await updateDownloadProgress(downloads);

    const totalDownloaded = downloads.parts.map(e => getDownloadedSize(e)).reduce((a, b) => a + b);
    const totalDownloadSize = downloads.parts.map(e => e.size).reduce((a, b) => a + b);

    const inProgressDownloads = downloads.parts.filter(e => e.state === "in_progress");

    let partProgress = '';
    for (const part of inProgressDownloads) {
        partProgress += `<br>Part ${part.part} ${(part.bytesReceived * 100 / part.size).toFixed(1)}% ${prettySize(part.bytesReceived)} / ${prettySize(part.size)}`;
    }

    const statusData = {
        statusString: `Bulk download in progress.<br><br><strong>Keep this dialog open!</strong><br><br><strong>Overall ${(totalDownloaded * 100 / totalDownloadSize).toFixed(2)}% ${prettySize(totalDownloaded)} / ${prettySize(totalDownloadSize)}</strong>${partProgress}`,
        isDownloading: !!downloads.isDownloading,
        startNextDownloadUrl: downloads.coolDown-- > 0 ? null : await getNextDownloadUrl(downloads.parts),
    };
    if (statusData.startNextDownloadUrl) downloads.coolDown = 10;
    await chrome.storage.local.set(downloads);
    return statusData;
}

let getUnit = numDivisions => {
    switch (numDivisions) {
        case 0:
            return 'B';
        case 1:
            return 'KB';
        case 2:
            return 'MB';
        case 3:
            return 'GB';
        case 4:
            return 'TB';
        case 5:
            return 'PB';
        default:
            return '?B';
    }
}

let prettySize = size => {
    let numDivisions = 0;
    while (size > 1024) {
        size = size / 1024;
        numDivisions++;
    }
    return `${size.toFixed(2)} ${getUnit(numDivisions)}`;
}

let updateDownloadProgress = async downloads => {
    let numUpdated = 0;
    for (const part of downloads.parts) {
        if (part.state && part.state === "in_progress") {
            const d = await chrome.downloads.search({ id: part.downloadId });
            if (d.length === 1) {
                part.bytesReceived = d[0].bytesReceived;
                if (d[0].state === "complete" || d[0].bytesReceived === d[0].totalBytes) {
                    part.state = "complete";
                    delete downloads.downloadIdToPartIdx[part.downloadId];
                } else if (d[0].state !== "in_progress") {
                    delete part.state;
                    delete part.downloadId;
                    delete part.bytesReceived;
                    delete downloads.downloadIdToPartIdx[part.downloadId];
                }
                numUpdated++;
            } else {
                delete part.state;
                delete part.downloadId;
                delete part.bytesReceived;
                delete downloads.downloadIdToPartIdx[part.downloadId];
            }
        }
    }
    return numUpdated !== 0;
}

const MAX_CONCURRENT_DOWNLOADS = 2;

let getNextDownloadUrl = async parts => {
    const inProgressDownloads = parts.filter(e => e.state === "in_progress");
    const numInProgress = inProgressDownloads.length;

    if (numInProgress >= MAX_CONCURRENT_DOWNLOADS) return null;
    if (numInProgress === 0) return getNextPartUrl(parts);

    // Both for in_progress only:
    const totalDownloadSize = inProgressDownloads.map(e => e.size).reduce((a, b) => a + b);
    const totalDownloadedSize = inProgressDownloads.map(e => e.bytesReceived).reduce((a, b) => a + b);

    // Don't saturate MAX_CONCURRENT_DOWNLOADS right away. Instead, attempt to stagger the downloads such that they are starting/ending as evenly as possible, assuming this will help to stay authed.
    const partLoad = numInProgress / MAX_CONCURRENT_DOWNLOADS;

    if (totalDownloadedSize / totalDownloadSize < partLoad) return null;
    return getNextPartUrl(parts);
};

let getNextPartUrl = parts => {
    const nextPart = parts.find(part => !part.downloadId);
    console.log(`Next part to download: ${nextPart.part}/${nextPart.parts}`);
    if (!nextPart) return null;
    return nextPart.url;
}

let getDownloadedSize = part => {
    if (part.state && part.state === "complete") return part.size;
    if (part.state && part.state === "in_progress") return part.bytesReceived;
    return 0;
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