console.log('This is the background page.');
console.log(chrome.downloads);

chrome.downloads.search({}).then(downloads => {
    console.log('Printing Downloads ' + new Date());
    downloads.forEach(function (item, i) {
        console.log(item);
    });
});