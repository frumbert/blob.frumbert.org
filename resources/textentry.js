/*
 * this script loads and stores ONE variable to an external server
 * it is designed to be embedded in a storyline block in rise
 * data is abstracted by course, page, question and user
 * it can be used multiple times on the same course without overwriting data (by using the block id, so don't duplicate pages)
 * it is multi-user aware, so it can be used by multiple users on the same course without overwriting data
 */

// This script is generic and exeucutes on timeline start (load) AND on submit button click (store)
// the following variable denotes the action to take
// valid actions are 'load' and 'store'
const Action = 'store';

/* ------------- don't edit below here ------------- */

const STORYLINE = GetPlayer();
const VARIABLE = 'TextEntry';
const BLOCK = window.name;
const BACKEND_URL = '/local/blobstorebackend';
const FALLBACK_URL = 'https://blob.frumbert.org';
let HAS_BACKEND = false;

// https://stackoverflow.com/a/74186696
function MD5(r) {
    var o, e, n, f = [ -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426, -1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162, 1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632, 643717713, -373897302, -701558691, 38016083, -660478335, -405537848, 568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784, 1735328473, -1926607734, -378558, -2022574463, 1839030562, -35309556, -1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222, -722521979, 76029189, -640364487, -421815835, 530742520, -995338651, -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606, -1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649, -145523070, -1120210379, 718787259, -343485551 ], t = [ o = 1732584193, e = 4023233417, ~o, ~e ], c = [], a = unescape(encodeURI(r)) + "\u0080", d = a.length;
    for (r = --d / 4 + 2 | 15, c[--r] = 8 * d; ~d; ) c[d >> 2] |= a.charCodeAt(d) << 8 * d--;
    for (i = a = 0; i < r; i += 16) {
        for (d = t; 64 > a; d = [ n = d[3], o + ((n = d[0] + [ o & e | ~o & n, n & o | ~n & e, o ^ e ^ n, e ^ (o | ~n) ][d = a >> 4] + f[a] + ~~c[i | 15 & [ a, 5 * a + 1, 3 * a + 5, 7 * a ][d]]) << (d = [ 7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21 ][4 * d + a++ % 4]) | n >>> -d), o, e ]) o = 0 | d[1], 
        e = d[2];
        for (a = 4; a; ) t[--a] += d[a];
    }
    for (r = ""; 32 > a; ) r += (t[a >> 3] >> 4 * (1 ^ a++) & 15).toString(16);
    return r;
}

// check to see if we have a local backend or need to use an online fallback
function GetServerLocation() {
    if (HAS_BACKEND) return window.location.origin + BACKEND_URL;
    return fetch(BACKEND_URL + '/', {
    	method: 'HEAD',
        headers: { 'Authorization': MD5(location.origin) }
    })
    .then(r => {
        if (r.ok) {
            HAS_BACKEND = true;
        	return window.location.origin + BACKEND_URL; // moodle plugin exists
        }
        throw new Error;
    }).catch((error) => {
        return FALLBACK_URL; // fallback to public server
    });
}
let SERVER = GetServerLocation();


// test for cross domain script access
function isCrossDomain() {
    try {
        window.parent.document;
    } catch (e) {
        return true;
    }
    return false;
}

function temporaryId(kind) {
    let identifier = sessionStorage.getItem(`${kind}_identifier`);
    if (!identifier) {
        identifier = crypto.randomUUID().slice(-12);
        sessionStorage.setItem(`${kind}_identifier`, identifier);
    }
    return identifier;
}

function findRuntimeWindow(win) {
    try {
        if (win.hasOwnProperty("Rise") || win.hasOwnProperty("courseData") || win.hasOwnProperty("courseId")) return win;
        else if (win.parent == win) return null;
        else return findRuntimeWindow(win.parent);
    } catch (e) {
        return window;
    }
}

function findLMSAPI(win) {
    try {
     if (win.hasOwnProperty("GetStudentID")) return win;
     else if (win.parent == win) return null;
     else return findLMSAPI(win.parent);
    } catch(e) {
        return null;
    }
}

function createDigest(str) {
    return btoa(encodeURIComponent(str)).replace(/\//g,'_').replace(/\+/g,'.').replace(/\=/g,'-');
    return MD5(str);
}

function getLocalTime() {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    return year + (month < 10 ? '0' : '') + month + (day < 10 ? '0' : '') + day + (hours < 10 ? '0' : '') + hours + (minutes < 10 ? '0' : '') + minutes + (seconds < 10 ? '0' : '') + seconds;
}

function getInstance() {
    if (isCrossDomain()) return createDigest(window.location.href);
    return createDigest(window.parent.location.href);
}

// set some properties based on content in the PARENT frame, where accessible
let courseTitle = window.document.title;
let contextId = temporaryId('context');
let pageTitle = '-';
let questionText = '-';
let titleSource = 'unknown';
let inst = getInstance();
const runtimeWindow = findRuntimeWindow(this);

// try turning my background transparent (modern,classic)
if (!document.body.querySelector('#stylepatch')) {
    let mystyle = document.createElement('style');
    mystyle.id = 'stylepatch';
    mystyle.textContent = `body,#wrapper,.slide .dropin-wrap rect[id^="slide-bg-"],svg[data-display-name='SlideBackground'] stop { background-color:transparent!important;stop-color:transparent!important;fill:none!important;}`;
    document.body.appendChild(mystyle);
}

if (window.parent !== window.self && !isCrossDomain()) {
    const IFRAME = parent.document.querySelector(`iframe[name="${BLOCK}"]`);

    try {
    //     // shrink the padding on the parent frame
    //     // mystyle.textContent = 'body,#wrapper,.slide .dropin-wrap rect[id^="slide-bg-"] { background-color: ' + style.backgroundColor + ' !important; fill: rgba(0,0,0,0) !important; }';
    //     // let style = parent.window.getComputedStyle(IFRAME.closest('.blocks-storyline'));
        if (!parent.document.querySelector('#shrinkpatch')) {
            let pstyle = document.createElement('style');
            pstyle.id = 'shrinkpatch';
            pstyle = parent.document.createElement('style');
            pstyle.textContent = '.blocks-storyline__wrapper { padding: 0 1.9999998rem !important; }';
            parent.document.body.appendChild(pstyle);
        }
    } catch(e) {}

    // try getting the course title
    // during development/preview, window.courseId is set. It will match to window.courseData.course.id when the course is exported/in review.
    try {
        if (runtimeWindow.hasOwnProperty('courseData')) {
            let c = JSON.parse(atob(runtimeWindow.courseData)).course;
            // console.log('found course data', c);
            courseTitle = c.title;
            contextId = c.id;
            titleSource = 'courseData';
        } else if (runtimeWindow.hasOwnProperty('courseId')) {
            console.info('testing for courseId');
            // console.log('found course id');
            courseTitle = runtimeWindow.courseId;
            contextId = runtimeWindow.courseId;
            titleSource = 'courseId';
        } else if (runtimeWindow) {
            // console.log('did not find course title');
            courseTitle = runtimeWindow.document.title;
            contextId = window.name;
            titleSource = 'runtimeWindow';
        } else {
            courseTitle = document.title;
            titleSource = 'self';
        }
    } catch(e) {}

    // try getting the page heading
    try {
        pageTitle = parent.document.querySelector('.lesson-header-wrap h1').textContent;
        // actually this matches parent.document.title as well
        // console.log('Found parent frame heading', pageTitle);
    } catch (e) {}

    // try getting the question text (block previous to this one)
    try {
        questionText = IFRAME.closest('[data-block-id]').previousElementSibling.textContent;
        // console.log('Found question text', questionText);
    } catch(e) {}

}

// if the player can find a scorm runtime, get it so that we can identify the user (otherwise we'll use a sessionStorage id)
let user = temporaryId('user');
let [myName, myId] = [user, user];
const lmsAPI = findLMSAPI(this);
if (lmsAPI) {
    myName = lmsAPI.GetStudentName();
    myId = lmsAPI.GetStudentID();
}
const digest = createDigest(myName + myId);

// load the data from the server and set the storyline variable
function LOAD_DATA() {
    SERVER.then((endpoint) => {
        let url = new URL(`${endpoint}/${digest}/${contextId}/${BLOCK}/`);
        return fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': MD5(location.origin),
                'Cache-Control': 'no-cache'
            },
            cache: "no-store"
        });
    }).then((response) => {
        if (!response.ok) {
            console.error(response);
            throw new Error('Network response was not ok');
        }
        return response.json();
    }).then((json) => {
        // console.info('Success:', json);
        STORYLINE.SetVar(VARIABLE, json.answer);
    }).catch((error) => {
        console.error('Error:', error);
    });
}

// store the storyline variable on the server
function STORE_DATA() {
    SERVER.then((endpoint) => {
        let url = new URL(`${endpoint}/${digest}/${contextId}/${BLOCK}/`);
        return fetch(url.toString(), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': MD5(location.origin),
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                instance: inst,
                ts: getLocalTime(),
                course: courseTitle,
                source: titleSource,
                page: pageTitle,
                kind: 'textentry',
                question: questionText,
                answer: STORYLINE.GetVar(VARIABLE),
                version: 20250207
            }),
            cache: "no-store"
        });
    }).then((response) => {
        if (!response.ok) {
            console.error(response);
            throw new Error('Network response was not ok');
        }
        return response.json();
    }).then((json) => {
        // console.info('Success:', json);
    }).catch((error) => {
        console.error('Error:', error);
    });
}

// main
switch (Action) {
    case "store":
        STORE_DATA();
        break;
    case "load":
        LOAD_DATA();
        STORYLINE.SetVar("fld_name", myName);
        STORYLINE.SetVar("fld_iud", myId);
        break;
}