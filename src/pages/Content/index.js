import { printDownloads } from './modules/print';

console.log('Content script loaded! 8');

printDownloads();

if (module.hot) {
    module.hot.accept('./modules/print.js', function () {
        console.log('Accepting the updated printDownloads module!');
        printDownloads();
    })
}
