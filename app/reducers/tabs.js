// @flow
import { remote, shell, webContents } from 'electron';
import { TYPES } from '@Actions/tabs_actions';
import { TYPES as UI_TYPES } from '@Actions/ui_actions';
import {
    makeValidAddressBarUrl,
    removeTrailingRedundancies
} from '@Utils/urlHelpers';
import { CONFIG, isRunningUnpacked } from '@Constants';
import path from 'path';
import logger from 'logger';
import initialAppState from './initialAppState';

const initialState = initialAppState.tabs;

/**
 * Retrieve the active tab object for a given windowId.
 * @param  { Array } state    State array
 * @param  { Integer } windowId  BrowserWindow webContents Id of target window.
 */
const getActiveTab = ( state, windowId ) =>
    state.find( tab =>
    {
        const currentWindowId = windowId || getCurrentWindowId();
        return tab.isActiveTab && tab.windowId === currentWindowId;
    } );

/**
 * Retrieve the active tab index for a given windowId.
 * @param  { Array } state    State array
 * @param  { Integer } windowId  BrowserWindow webContents Id of target window.
 */
const getActiveTabIndex = ( state, windowId ) =>
{
    const currentWindowId = windowId || getCurrentWindowId();

    return state.findIndex(
        tab => tab.isActiveTab && tab.windowId === currentWindowId
    );
};

/**
 * Get the current window's webcontents Id. Defaults to `1` if none found.
 * @return { Integer } WebContents Id of the curremt BrowserWindow webcontents.
 */
const getCurrentWindowId = () =>
{
    let currentWindowId = 1; // for testing

    if ( remote )
    {
        currentWindowId = remote.getCurrentWindow().webContents.id;
    }
    else if ( webContents )
    {
        const allWindows = webContents.getAllWebContents();

        const currentWindow = allWindows.find( win =>
        {
            const cleanedPath = removeTrailingRedundancies( win.history[0] );
            return (
                path.basename( cleanedPath )
                === path.basename( CONFIG.APP_HTML_PATH )
            );
        } );

        currentWindowId = currentWindow.id;
    }

    return currentWindowId;
};

const addTab = ( state, tab ) =>
{
    logger.info( 'add Tab happening in reducer' );
    if ( !tab )
    {
        throw new Error( 'You must pass a tab object with url' );
    }

    const currentWindowId = getCurrentWindowId();

    const targetWindowId = tab.windowId || currentWindowId;
    const tabUrl = makeValidAddressBarUrl( tab.url || '' );
    const faviconPath = isRunningUnpacked
        ? '../resources/favicon.ico'
        : '../favicon.ico';
    const newTab = {
        ...tab,
        windowId     : targetWindowId,
        historyIndex : 0,
        history      : [ tabUrl ],
        index        : state.length,
        favicon      : faviconPath
    };

    let newState = [ ...state ];

    if ( newTab.isActiveTab )
    {
        newState = deactivateOldActiveTab( newState, targetWindowId );
    }

    newState.push( newTab );

    return newState;
};

/**
 * Set a tab as closed. If it is active, deactivate and and set a new active tab
 * @param { array } state
 * @param { object } payload
 */
const closeTab = ( state, payload ) =>
{
    try
    {
        var { index, tabToMerge } = handleTabPayload( state, payload );
    }
    catch ( err )
    {
        logger.error( err );
        return state;
    }

    const currentWindowId = getCurrentWindowId();
    const targetWindowId = tabToMerge.windowId ? tabToMerge.windowId : currentWindowId;
    const openTabs = state.filter( tab => !tab.isClosed && tab.windowId === targetWindowId );

    const updatedTab = {
        ...tabToMerge,
        isActiveTab : false,
        index,
        isClosed    : true,
        closedTime  : new Date()
    };

    let updatedState = [ ...state ];
    updatedState[index] = updatedTab;

    if ( tabToMerge.isActiveTab )
    {
        const ourTabIndex = openTabs.findIndex( tab => JSON.stringify( tab ) === JSON.stringify( tabToMerge ) );

        const nextTab = ourTabIndex + 1;
        const prevTab = ourTabIndex - 1;
        const targetOpenTabsIndex = openTabs.length > nextTab ? nextTab : prevTab;
        let targetIndex;

        if ( targetOpenTabsIndex >= 0 )
        {
            const newOpenTab = openTabs[targetOpenTabsIndex];

            targetIndex = updatedState.findIndex( tab => tab === newOpenTab );
        }

        updatedState = setActiveTab( updatedState, { index: targetIndex } );
    }

    return updatedState;
};

const deactivateOldActiveTab = ( state, windowId ) =>
{
    const currentWindowId = windowId || getCurrentWindowId();
    const activeTabIndex = getActiveTabIndex( state, currentWindowId );

    if ( activeTabIndex > -1 )
    {
        const oldActiveTab = getActiveTab( state, currentWindowId );
        const updatedOldTab = { ...oldActiveTab, isActiveTab: false };
        const updatedState = [ ...state ];
        updatedState[activeTabIndex] = updatedOldTab;
        return updatedState;
    }

    return state;
};

export function getLastClosedTab( state )
{
    let i = 0;
    const tabAndIndex = {
        lastTabIndex : 0
    };

    const tab = state.reduce( ( prev, current ) =>
    {
        let tab;
        if ( !prev.closedTime || current.closedTime > prev.closedTime )
        {
            tabAndIndex.lastTabIndex = i;
            tab = current;
        }
        else
        {
            tab = prev;
        }

        i += 1;
        return tab;
    }, state[0] );

    tabAndIndex.lastTab = tab;

    return tabAndIndex;
}


const moveTabForwards = ( state, payload ) =>
{
    try
    {
        var { index, tabToMerge } = handleTabPayload( state, payload );
    }
    catch ( err )
    {
        logger.error( err );
        return state;
    }

    const updatedTab = tabToMerge;
    const history = updatedTab.history;
    const nextHistoryIndex = updatedTab.historyIndex + 1 || 1;

    // -1 historyIndex signifies latest page
    if ( !history || history.length < 2 || !history[nextHistoryIndex] )
    {
        return state;
    }

    const newUrl = history[nextHistoryIndex];

    const updatedState = [ ...state ];

    updatedTab.historyIndex = nextHistoryIndex;
    updatedTab.url = newUrl;

    updatedState[index] = updatedTab;
    return updatedState;
};


const moveTabBackwards = ( state, payload ) =>
{
    try
    {
        var { index, tabToMerge } = handleTabPayload( state, payload );
    }
    catch ( err )
    {
        logger.error( err );
        return state;
    }

    const updatedTab = tabToMerge;
    const history = updatedTab.history;
    const nextHistoryIndex = updatedTab.historyIndex - 1;

    // -1 historyIndex signifies first page
    if (
        !history
        || history.length < 2
        || !history[nextHistoryIndex]
        || nextHistoryIndex < 0
    )
    {
        return state;
    }

    const newUrl = history[nextHistoryIndex];

    const updatedState = [ ...state ];

    updatedTab.historyIndex = nextHistoryIndex;
    updatedTab.url = newUrl;

    updatedState[index] = updatedTab;
    return updatedState;
};

const reopenTab = state =>
{
    let { lastTab, lastTabIndex } = getLastClosedTab( state );

    lastTab = { ...lastTab, isClosed: false, closedTime: null };
    let updatedState = [ ...state ];

    updatedState[lastTabIndex] = lastTab;
    updatedState = setActiveTab( updatedState, { index: lastTabIndex } );

    return updatedState;
};

/**
 * set active tab to a given index
 * @param       { Array } state the state array of tabs
 * @param       { Int } index index to set as activeTabIndex
 * @constructor
 */
const setActiveTab = ( state, payload ) =>
{
    const index = payload.index;
    const newActiveTab = state[index];
    let updatedState = [ ...state ];

    if ( newActiveTab )
    {
        const targetWindowId = newActiveTab.windowId;

        updatedState = deactivateOldActiveTab( updatedState, targetWindowId );
        updatedState[index] = {
            ...newActiveTab,
            isActiveTab : true,
            isClosed    : false
        };
    }

    return updatedState;
};

const updateTabHistory = ( tabToMerge, payload ) =>
{
    const url = makeValidAddressBarUrl( payload.url );
    let updatedTab = { ...tabToMerge, ...payload };
    const ancientHistory = tabToMerge.history;
    let newHistory = [ ...ancientHistory ];
    const currentIndex = tabToMerge.historyIndex;

    if ( url && url !== tabToMerge.url )
    {
        if ( ancientHistory && ancientHistory[currentIndex] !== url )
        {
            updatedTab.historyIndex += 1;

            // if we're not at last index split array there.
            if ( ancientHistory.length - 1 !== currentIndex )
            {
                newHistory = newHistory.slice( 0, currentIndex + 1 );
            }

            // else, a simple addition to array
            updatedTab.history = newHistory;
            updatedTab.history.push( url );
        }
    }

    updatedTab = {
        ...updatedTab,
        url
    };

    return updatedTab;
};

const handleTabPayload = ( state, payload ) =>
{
    if ( payload )
    {
        if ( payload.constructor !== Object )
        {
            throw new Error( "Payload must be an Object." );
        }

        if ( payload.index || payload.index === 0 )
        {
            const  { index } = payload;
            const  tabToMerge = { ...state[index] };
            return { index, tabToMerge };
        }
        else if ( payload.windowId )
        {
            const windowId = payload.windowId;
            const tab = getActiveTab( state, windowId );
            const index = getActiveTabIndex( state, windowId );
            const tabToMerge = { ...tab };
            return { index, tabToMerge };
        }
        else
        {
            const tab = getActiveTab( state );
            const index = getActiveTabIndex( state );
            const tabToMerge = { ...tab };
            return { index, tabToMerge };
        }
    }
    else
    {
        const tab = getActiveTab( state );
        const index = getActiveTabIndex( state );
        const tabToMerge = { ...tab };
        return { index, tabToMerge };
    }

}

const updateTab = ( state, payload ) =>
{
    try
    {
        var { index, tabToMerge } = handleTabPayload( state, payload );
    }
    catch ( err )
    {
        logger.error( err );
        return state;
    }

    if ( index < 0 )
    {
        return state;
    }

    let updatedTab = { ...tabToMerge, ...payload };

    if ( payload.url )
    {
        updatedTab = updateTabHistory( tabToMerge, payload );
    }

    const updatedState = [ ...state ];

    updatedState[index] = updatedTab;

    return updatedState;
};

const reindexTabs = tabs => tabs.map( ( tab, index ) => ( { ...tab, index } ) );

/**
 * Tabs reducer. Should handle all tab states, including window/tab id and the individual tab history
 * @param  { array } state  array of tabs
 * @param  { object } action action Object
 * @return { array }        updatd state object
 */
export default function tabs( state: array = initialState, action )
{
    const payload = action.payload;

    if ( action.error )
    {
        logger.error( 'ERROR IN ACTION', action.error );
        return state;
    }

    switch ( action.type )
    {
        case TYPES.ADD_TAB: {
            return addTab( state, payload );
        }
        case TYPES.SET_ACTIVE_TAB: {
            return setActiveTab( state, payload );
        }
        case TYPES.CLOSE_TAB: {
            return closeTab( state, payload );
        }
        case TYPES.REOPEN_TAB :
        {
            return reopenTab( state );
        }
        case TYPES.UPDATE_TAB :
        {
            return updateTab( state, payload );
        }
        case TYPES.TAB_FORWARDS :
        {
            return moveTabForwards( state, payload );
        }
        case TYPES.TAB_BACKWARDS :
        {
            return moveTabBackwards( state, payload );
        }
        case TYPES.UPDATE_TABS: {
            const payloadTabs = payload.tabs;

            payloadTabs.forEach( tab =>
            {
                tab.isClosed = true;
                tab.isActiveTab = false;
                return tab;
            } );

            const newTabs = [ ...state, ...payloadTabs ];

            return reindexTabs( newTabs );
        }
        case UI_TYPES.RESET_STORE: {
            const initial = initialState;
            const firstTab = { ...initial[0] };
            const currentWindowId = getCurrentWindowId();

            firstTab.windowId = currentWindowId;

            return [ firstTab ];
        }
        default:
            return state;
    }
}
