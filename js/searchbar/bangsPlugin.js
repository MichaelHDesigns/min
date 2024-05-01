var tabEditor = require('navbar/tabEditor.js');
var settings = require('util/settings/settings.js');
var searchbar = require('searchbar/searchbar.js');
var searchbarPlugins = require('searchbar/searchbarPlugins.js');
var searchbarAutocomplete = require('util/autocomplete.js');
var Web3 = require('web3');

// Assuming you have a web3 provider configured for Polygon
var web3 = new Web3('https://polygon-rpc.com'); // Change to your preferred RPC provider

// Debounce function for saving bang use counts
var saveBangUseCounts = debounce(function () {
    localStorage.setItem('bangUseCounts', JSON.stringify(bangUseCounts));
}, 10000);

// Format for custom bangs: { phrase, snippet, score, icon, fn, isCustom, isAction }
var customBangs = [];
var bangUseCounts = JSON.parse(localStorage.getItem('bangUseCounts') || '{}');

// Register a custom bang
function registerCustomBang(data) {
    customBangs.push({
        phrase: data.phrase,
        snippet: data.snippet,
        score: data.score || 256000,
        icon: data.icon || 'carbon:terminal',
        showSuggestions: data.showSuggestions,
        fn: data.fn,
        isCustom: true,
        isAction: data.isAction || false
    });
}

// Search for custom bangs
function searchCustomBangs(text) {
    return customBangs.filter(function (item) {
        return item.phrase.indexOf(text) === 0;
    });
}

// Increment bang use count
function incrementBangCount(bang) {
    if (bangUseCounts[bang]) {
        bangUseCounts[bang]++;
    } else {
        bangUseCounts[bang] = 1;
    }

    // Prevent data from getting too big
    if (bangUseCounts[bang] > 100) {
        for (var key in bangUseCounts) {
            bangUseCounts[key] = Math.floor(bangUseCounts[key] * 0.8);
            if (bangUseCounts[key] < 2) {
                delete bangUseCounts[key];
            }
        }
    }

    saveBangUseCounts();
}

// Show search results for custom bangs
function showBangSearchResults(text, results, input, event, limit = 5) {
    searchbarPlugins.reset('bangs');
    results.sort(function (a, b) {
        var aScore = a.score || 1;
        var bScore = b.score || 1;
        if (bangUseCounts[a.phrase]) {
            aScore *= bangUseCounts[a.phrase];
        }
        if (bangUseCounts[b.phrase]) {
            bScore *= bangUseCounts[b.phrase];
        }
        return bScore - aScore;
    });
    results.slice(0, limit).forEach(function (result, idx) {
        var data = {
            icon: result.icon,
            iconImage: result.image,
            title: result.snippet,
            secondaryText: result.phrase,
            fakeFocus: text !== '!' && idx === 0
        };
        data.click = function (e) {
            if (result.isAction && result.fn) {
                searchbar.openURL(result.phrase, e);
                return;
            }
            setTimeout(function () {
                incrementBangCount(result.phrase);
                input.value = result.phrase + ' ';
                input.focus();
                if (result.showSuggestions) {
                    result.showSuggestions('', input, event);
                }
            }, 66);
        };
        searchbarPlugins.addResult('bangs', data);
    });
}

// Search for bangs
function getBangSearchResults(text, input, event) {
    if (text.indexOf(' ') !== -1) {
        var bang = getCustomBang(text);
        if (bang && bang.showSuggestions) {
            bang.showSuggestions(text.replace(bang.phrase, '').trimLeft(), input, event);
            return;
        } else if (text.trim().indexOf(' ') !== -1) {
            searchbarPlugins.reset('bangs');
            return;
        }
    }
    var resultsPromise;
    if (searchEngine.getCurrent().name === 'DuckDuckGo' && !tabs.get(tabs.getSelected()).private) {
        resultsPromise = fetch('https://ac.duckduckgo.com/ac/?t=min&q=' + encodeURIComponent(text), {
            cache: 'force-cache'
        })
            .then(function (response) {
                return response.json();
            });
    } else {
        resultsPromise = new Promise(function (resolve, reject) {
            setTimeout(function () {
                resolve([]);
            }, 0);
        });
    }
    resultsPromise.then(function (results) {
        if (text === '!') {
            results = results.slice(0, 8);
        }
        results = results.concat(searchCustomBangs(text));
        if (text === '!') {
            showBangSearchResults(text, results, input, event);
            searchbarPlugins.addResult('bangs', {
                title: l('showMoreBangs'),
                icon: 'carbon:chevron-down',
                click: function () {
                    showBangSearchResults(text, results, input, event, Infinity);
                }
            });
        } else {
            showBangSearchResults(text, results, input, event);
            if (results[0] && event.keyCode !== 8) {
                searchbarAutocomplete.autocomplete(input, [results[0].phrase]);
            }
        }
    });
}

async function displayAddressInfo(address) {
    try {
        const isContract = await web3.eth.getCode(address) !== '0x';
        if (isContract) {
            displayContractInfo(address);
        } else {
            displayWalletInfo(address);
        }
    } catch (error) {
        console.error('Error:', error);
        displayUserInfo(address);
    }
}

async function displayContractInfo(address) {
    // Implement logic to display contract information
    console.log('Displaying contract info for address:', address);
}

async function displayWalletInfo(address) {
    // Implement logic to display wallet information
    console.log('Displaying wallet info for address:', address);
    const balance = await web3.eth.getBalance(address);
    console.log('Balance:', balance);
}

async function displayUserInfo(address) {
    // Implement logic to display user information
    console.log('Displaying user info for address:', address);
    const balance = await web3.eth.getBalance(address);
    console.log('Balance:', balance);
}

async function initialize() {
    searchbarPlugins.register('bangs', {
        index: 1,
        trigger: function (text) {
            return !!text && text.indexOf('!') === 0;
        },
        showResults: getBangSearchResults
    });

    searchbarPlugins.registerURLHandler(function (url) {
        if (url.startsWith('polygon://')) {
            var address = url.substring(11);
            console.log("Opening Polygon address:", address);
            displayAddressInfo(address);
            return true;
        }
        if (url.indexOf('!') === 0) {
            incrementBangCount(url.split(' ')[0]);
            var bang = getCustomBang(url);
            if ((!bang || !bang.isAction) && url.split(' ').length === 1 && !url.endsWith(' ')) {
                tabEditor.show(tabs.getSelected(), url + ' ');
                return true;
            } else if (bang) {
                tabEditor.hide();
                bang.fn(url.replace(bang.phrase, '').trimLeft());
                return true;
            }
        }
        return false;
    });

    const savedBangs = settings.get('customBangs');
    if (savedBangs) {
        savedBangs.forEach((bang) => {
            if (!bang.phrase || !bang.redirect) return;
            registerCustomBang({
                phrase: `!${bang.phrase}`,
                snippet: `${bang.snippet}` ?? '',
                isAction: !bang.redirect.includes('%s'),
                fn: function (text) {
                    searchbar.openURL(bang.redirect.replace('%s', encodeURIComponent(text)));
                }
            });
        });
    }
}

module.exports = { initialize, registerCustomBang };
