const punycode = require('punycode');
const path = require('path');

const searchEngine = require('util/searchEngine.js');
const hosts = require('./hosts.js');
const httpsTopSites = require('../../ext/httpsUpgrade/httpsTopSites.json');
const publicSuffixes = require('../../ext/publicSuffixes/public_suffix_list.json');

function removeWWW(domain) {
    return (domain.startsWith('www.') ? domain.slice(4) : domain);
}

function removeTrailingSlash(url) {
    return (url.endsWith('/') ? url.slice(0, -1) : url);
}

function isPolygonAddress(url) {
    // Polygon address regex
    return /^0x[a-fA-F0-9]{40}$/i.test(url);
}

var urlParser = {
    validIP4Regex: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/i,
    validDomainRegex: /^(?!-)(?:.*@)*?([a-z0-9-._]+[a-z0-9]|\[[:a-f0-9]+\])/i,
    unicodeRegex: /[^\u0000-\u00ff]/,
    removeProtocolRegex: /^(https?|file):\/\//i,
    protocolRegex: /^[a-z0-9]+:\/\//, // URI schemes can be alphanum
    isURL: function (url) {
        return urlParser.protocolRegex.test(url) || url.indexOf('about:') === 0 || url.indexOf('chrome:') === 0 || url.indexOf('data:') === 0
    },
    isPossibleURL: function (url) {
        if (urlParser.isURL(url)) {
            return true;
        } else if (isPolygonAddress(url)) {
            return true;
        } else {
            if (url.indexOf(' ') >= 0) {
                return false;
            }
        }

        const domain = urlParser.getDomain(url);
        return hosts.includes(domain);
    },
    removeProtocol: function (url) {
        if (!urlParser.isURL(url)) {
            return url;
        }

        return url.replace(urlParser.removeProtocolRegex, '');
    },
    isURLMissingProtocol: function (url) {
        return !urlParser.protocolRegex.test(url);
    },
    parse: function (url) {
        url = url.trim();

        if (!url) {
            return 'about:blank';
        }

        if (url.indexOf('view-source:') === 0) {
            var realURL = url.replace('view-source:', '');
            return 'view-source:' + urlParser.parse(realURL);
        }

        if (isPolygonAddress(url)) {
            // Handle Polygon wallet addresses
            return 'polygon://' + url;
        }

        if (url.startsWith('min:') && !url.startsWith('min://app/')) {
            const urlChunks = url.split('?')[0].replace(/min:(\/\/)?/g, '').split('/');
            const query = url.split('?')[1];
            return 'min://app/pages/' + urlChunks[0] + (urlChunks[1] ? urlChunks.slice(1).join('/') : '/index.html') + (query ? '?' + query : '');
        }

        if (urlParser.isURL(url)) {
            if (!urlParser.isInternalURL(url) && url.startsWith('http://')) {
                const noProtoURL = urlParser.removeProtocol(url);
                if (urlParser.isHTTPSUpgradable(noProtoURL)) {
                    return 'https://' + noProtoURL;
                }
            }
            return url;
        }

        if (urlParser.isURLMissingProtocol(url) && urlParser.validateDomain(urlParser.getDomain(url))) {
            if (urlParser.isHTTPSUpgradable(url)) {
                return 'https://' + url;
            }
            return 'http://' + url;
        }

        return searchEngine.getCurrent().searchURL.replace('%s', encodeURIComponent(url));
    },
    basicURL: function (url) {
        return removeWWW(urlParser.removeProtocol(removeTrailingSlash(url)));
    },
    prettyURL: function (url) {
        try {
            var urlOBJ = new URL(url);
            return removeWWW(removeTrailingSlash(urlOBJ.hostname + urlOBJ.pathname));
        } catch (e) {
            return url;
        }
    },
    isInternalURL: function (url) {
        return url.startsWith('min://');
    },
    getSourceURL: function (url) {
        if (urlParser.isInternalURL(url)) {
            var representedURL;
            try {
                representedURL = new URLSearchParams(new URL(url).search).get('url');
            } catch (e) {}
            if (representedURL) {
                return representedURL;
            } else {
                try {
                    var pageName = url.match(/\/pages\/([a-zA-Z]+)\//);
                    var urlObj = new URL(url);
                    if (pageName) {
                        return 'min://' + pageName[1] + urlObj.search;
                    }
                } catch (e) {}
            }
        }
        return url;
    },
    getFileURL: function (path) {
        if (window.platformType === 'windows') {
            path = path.replace(/\\/g, '/');
            if (path.startsWith('//')) {
                return encodeURI('file:' + path);
            } else {
                return encodeURI('file:///' + path);
            }
        } else {
            return encodeURI('file://' + path);
        }
    },
    getDomain: function (url) {
        url = urlParser.removeProtocol(url);
        return url.split(/[/:]/)[0].toLowerCase();
    },
    validateDomain: function (domain) {
        domain = urlParser.unicodeRegex.test(domain)
            ? punycode.toASCII(domain)
            : domain;

        if (!urlParser.validDomainRegex.test(domain)) {
            return false;
        }
        const cleanDomain = RegExp.$1;
        if (cleanDomain.length > 255) {
            return false;
        }

        if ((urlParser.validIP4Regex.test(cleanDomain) || (cleanDomain.startsWith('[') && cleanDomain.endsWith(']'))) ||
            hosts.includes(cleanDomain)) {
            return true;
        }
        return publicSuffixes.find(s => cleanDomain.endsWith(s)) !== undefined;
    },
    isHTTPSUpgradable: function (url) {
        const domain = removeWWW(urlParser.getDomain(url));
        return httpsTopSites.includes(domain);
    }
};

module.exports = urlParser;
