// @flow
import { remote, ipcRenderer } from 'electron';
// import contextMenu from 'electron-context-menu';
import React, { Component } from 'react';
import Error from '@Components/PerusePages/Error';
import ReactDOMServer from 'react-dom/server';
import _ from 'lodash';
import PropTypes from 'prop-types';
import {
    addTrailingSlashIfNeeded,
    removeTrailingSlash,
    urlHasChanged
} from '@Utils/urlHelpers';
import path from 'path';
import { parse as parseURL } from 'url';
import logger from 'logger';
import { I18n } from 'react-redux-i18n';
import styles from './tab.css';

const stdUrl = require( 'url' );

// drawing on itch browser meat: https://github.com/itchio/itch/blob/3231a7f02a13ba2452616528a15f66670a8f088d/appsrc/components/browser-meat.js
const WILL_NAVIGATE_GRACE_PERIOD = 3000;
const SHOW_DEVTOOLS = parseInt( process.env.DEVTOOLS, 10 ) > 1;

export default class Tab extends Component
{
    static propTypes = {
        isActiveTab          : PropTypes.bool.isRequired,
        url                  : PropTypes.string.isRequired,
        index                : PropTypes.number.isRequired,
        windowId             : PropTypes.number.isRequired,
        closeTab             : PropTypes.func.isRequired,
        updateTab            : PropTypes.func.isRequired,
        addTab               : PropTypes.func.isRequired,
        addNotification      : PropTypes.func.isRequired,
        focusWebview         : PropTypes.func.isRequired,
        shouldFocusWebview   : PropTypes.bool.isRequired,
        tabBackwards         : PropTypes.func.isRequired
    }

    static defaultProps =
    {
        isActiveTab : false,
        url         : 'http://nowhere.com',
    }


    constructor( props )
    {
        super( props );

        this.state = {
            browserState : {
                canGoBack       : false,
                canGoForward    : false,
                loading         : true,
                mountedAndReady : false,
                url             : '',
                redirects       : []
            }
        };

        // this.domReady = ::this.domReady;
        this.goBack = ::this.goBack;
        this.goForward = ::this.goForward;
        this.reload = ::this.reload;
        this.stop = ::this.stop;
        this.openDevTools = ::this.openDevTools;
        this.loadURL = ::this.loadURL;

        this.debouncedWebIdUpdateFunc = _.debounce(
            this.updateTheIdInWebview,
            300
        );
    }

    isDevToolsOpened = () =>
    {
        const { webview } = this;

        if ( webview )
        {
            return webview.isDevToolsOpened();
        }
    };

    buildMenu = webview => {

        if (!webview.getWebContents) return; // 'not now, as you're running jest;
        const { addTab } = this.props;

        // require here to avoid jest/electron remote issues
        const contextMenu = require( 'electron-context-menu' );
        contextMenu( {
            window : webview,
            append : params => [
                {
                    label: 'Open Link in New Tab.',
                    visible: params.linkURL.length > 0,
                    click()
                    {
                        addTab( { url: params.linkURL, isActiveTab: true } );
                    }
                }
            ],
            showCopyImageAddress : true,
            showInspectElement   : true
        } );
    };

    webviewFocussed( event )
    {
        logger.info(
            'Webview focussed: Triggering click event on browser window'
        );

        const fakeClick = new MouseEvent( 'click', {
            view       : window,
            bubbles    : true,
            cancelable : true
        } );

        window.dispatchEvent( fakeClick );
    }

    componentDidMount()
    {
        const { webview } = this;
        const callbackSetup = () =>
        {
            if ( !webview )
            {
                logger.info(
                    'No webview found so not doing: callback setup on window webview'
                );
                return;
            }

            webview.addEventListener(
                'did-start-loading',
                ::this.didStartLoading
            );
            webview.addEventListener( 'did-stop-loading', ::this.didStopLoading );
            webview.addEventListener(
                'did-finish-load',
                ::this.didFinishLoading
            );
            webview.addEventListener( 'crashed', ::this.onCrash );
            webview.addEventListener( 'gpu-crashed', ::this.onGpuCrash );
            webview.addEventListener( 'will-navigate', ::this.willNavigate );
            webview.addEventListener( 'did-navigate', ::this.didNavigate );
            webview.addEventListener(
                'did-navigate-in-page',
                ::this.didNavigateInPage
            );
            webview.addEventListener(
                'did-get-redirect-request',
                ::this.didGetRedirectRequest
            );
            webview.addEventListener(
                'page-title-updated',
                ::this.pageTitleUpdated
            );
            webview.addEventListener(
                'page-favicon-updated',
                ::this.pageFaviconUpdated
            );
            webview.addEventListener( 'new-window', ::this.newWindow );
            webview.addEventListener( 'did-fail-load', ::this.didFailLoad );
            webview.addEventListener(
                'update-target-url',
                ::this.updateTargetUrl
            );

            webview.addEventListener( 'focus', ::this.webviewFocussed );

            this.domReady();

            webview.removeEventListener( 'dom-ready', callbackSetup );
        };

        this.buildMenu( webview );

        webview.src = 'about:blank';

        webview.addEventListener( 'dom-ready', callbackSetup );

        webview.addEventListener( 'dom-ready', () =>
        {
            this.didStopLoading();
        } );
    }

    componentWillReceiveProps( nextProps )
    {
        if ( JSON.stringify( nextProps ) === JSON.stringify( this.props ) ) return;

        if ( !this.state.browserState.mountedAndReady ) return;

        const { focusWebview, isActiveTab, url, updateTab, index, shouldToggleDevTools, shouldReload } = this.props;
        const { webview } = this;

        logger.info( 'Tab: did receive updated props' );

        if ( nextProps.shouldFocusWebview && isActiveTab )
        {
            this.with( ( webview, webContents ) =>
            {
                webview.focus();
                webContents.focus();
            } );
            focusWebview( false );
        }
        if (
            !this.props.shouldFocusWebview
            && !nextProps.shouldFocusWebview
            && nextProps.isActiveTab
        )
        {
            focusWebview( true );
        }

        const nextId = nextProps.webId || {};
        const currentId = this.props.webId || {};
        if ( nextId['@id'] !== currentId['@id'] )
        {
            if ( !webview ) return;

            logger.info( 'New WebID set for ', nextProps.url );

            this.setCurrentWebId( nextProps.webId );
        }

        if ( nextProps.url && nextProps.url !== url )
        {
            if ( !webview ) return;
            const webviewSrc = parseURL( webview.src );

            if (
                webviewSrc.href === ''
                || `${ webviewSrc.protocol }${ webviewSrc.hostname }`
                    === 'about:blank'
                || urlHasChanged( webview.src, nextProps.url )
            )
            {
                this.loadURL( nextProps.url );
            }
        }

        if ( !shouldReload && nextProps.shouldReload )
        {
            logger.verbose('Should reload URL: ', nextProps.url);
            this.reload();
            const tabUpdate = {
                index,
                shouldReload : false
            };
            updateTab( tabUpdate );
        }

        if ( !shouldToggleDevTools && nextProps.shouldToggleDevTools )
        {
            ( this.isDevToolsOpened() ) ? this.closeDevTools() : this.openDevTools();
            const tabUpdate = {
                index,
                shouldToggleDevTools : false
            };
            updateTab( tabUpdate );
        }
    }

    updateBrowserState( props = {} )
    {
        const { webview } = this;
        if ( !webview )
        {
            return;
        }
        if ( !webview.partition || webview.partition === '' )
        {
            console.warn( `${ this.props.index }: webview has empty partition` );
        }

        const browserState = {
            ...this.state.browserState,
            canGoBack    : webview.canGoBack(),
            canGoForward : webview.canGoForward(),
            ...props
        };

        this.setState( { browserState } );
    }

    domReady()
    {
        const { url } = this.props;
        const { webview } = this;

        const webContents = webview.getWebContents();
        if ( !webContents || webContents.isDestroyed() ) return;

        if ( SHOW_DEVTOOLS )
        {
            webContents.openDevTools( { mode: 'detach' } );
        }

        this.updateBrowserState( { loading: false, mountedAndReady: true } );

        if ( url && url !== 'about:blank' )
        {
            this.loadURL( url ).catch( err => console.info( 'err in loadurl', err ) );

            this.setCurrentWebId( null );
        }
    }

    onCrash = e =>
    {
        console.error( e );
        logger.error( 'The webview crashed', e );
    };

    onGpuCrash = e =>
    {
        console.error( e );
        logger.error( 'The webview GPU crashed', e );
    };

    didStartLoading()
    {
        logger.info( 'webview started loading' );
        const { updateTab, index } = this.props;

        const tabUpdate = {
            index,
            isLoading : true
        };

        this.updateBrowserState( { loading: true } );
        updateTab( tabUpdate );
        window.addEventListener( 'focus', () => {
            this.with( ( webview, webContents ) =>
            {
                webview.focus();
                webContents.focus();
            } );
        } );
    }

    didFailLoad( err )
    {
        const {
            url,
            index,
            addTab,
            closeTab,
            addNotification,
            tabBackwards,
            windowId
        } = this.props;
        const { webview } = this;
        const urlObj = stdUrl.parse( url );
        const renderError = ( header, subHeader ) =>
        {
            const errorAsHtml = ReactDOMServer.renderToStaticMarkup(
                <Error error={ { header, subHeader } } />
            );
            webview.executeJavaScript( `
                try
                {
                    const body = document.querySelector('body');
                    body.innerHTML = '${ errorAsHtml }';
                }
                catch ( err )
                {
                    console.error(err);
                }
            ` );
        };

        if (
            urlObj.hostname === '127.0.0.1'
            || urlObj.hostname === 'localhost'
        )
        {
            try
            {
                renderError( 'Page Load Failed' );
            }
            catch ( scriptError )
            {
                logger.error( scriptError );
            }
            return;
        }
        if ( err && err.errorDescription === 'ERR_INVALID_URL' )
        {
            try
            {
                renderError( `Invalid URL: ${ url }` );
            }
            catch ( scriptError )
            {
                logger.error( scriptError );
            }
            return;
        }
        if ( err && err.errorDescription === 'ERR_BLOCKED_BY_CLIENT' )
        {
            const header = 'Detected HTTP/S protocol.';
            const subHeader = `Redirecting ${ url } to be opened by your default Web browser.`;
            const notification = {
                reactNode : Error( { error: { header, subHeader } } )
            };
            addNotification( notification );
            if( this.state.browserState.canGoBack )
            {

                tabBackwards( { index, windowId } );
            }
            else
            {
                closeTab({ index });

                // add a fresh tab (should be only if no more tabs present)
                addTab( { url: 'about:blank', windowId, isActiveTab: true } );
            }
        }
    }

    didStopLoading()
    {
        logger.info( 'Tab did stop loading' );
        const { updateTab, index, isActiveTab } = this.props;

        const tabUpdate = {
            index,
            isLoading : false
        };

        this.updateBrowserState( { loading: false } );
        updateTab( tabUpdate );

        this.setCurrentWebId( null );
    }

    didFinishLoading( )
    {
        const { updateTab, index, url } = this.props;

        logger.info( 'Tab did finish loading' );
        const tabUpdate = {
            index,
            isLoading : false
        };


        if ( url === 'about:blank' )
        {
            tabUpdate.title = '';
        }

        this.updateBrowserState( { loading: false } );
        updateTab( tabUpdate );

        this.setCurrentWebId( null );
    }

    updateTargetUrl( url )
    {
        const linkRevealer = document.getElementById( 'link_revealer' );
        if ( url.url )
        {
            linkRevealer.setAttribute( 'class', 'reveal_link' );
            linkRevealer.innerText = url.url;
        }
        else
        {
            linkRevealer.setAttribute( 'class', 'no_display' );
            linkRevealer.innerText = '';
        }
    }

    pageTitleUpdated( e )
    {
        logger.info( 'Webview: page title updated' );

        const title = e.title;
        const { updateTab, index, isActiveTab } = this.props;

        const tabUpdate = {
            title,
            index
        };

        updateTab( tabUpdate );
    }

    pageFaviconUpdated( e )
    {
        logger.info( 'Webview: page favicon updated: ', e );
        const { updateTab, index } = this.props;

        const tabUpdate = {
            index,
            favicon : e.favicons[0]
        };

        updateTab( tabUpdate );
    }

    didNavigate( e )
    {
        const { updateTab, index } = this.props;
        const { url } = e;
        const noTrailingSlashUrl = removeTrailingSlash( url );

        logger.info( 'webview did navigate' );

        // TODO: Actually overwrite history for redirect
        if ( !this.state.browserState.redirects.includes( url ) )
        {
            this.updateBrowserState( { url, redirects: [ url ] } );
            updateTab( { index, url } );

            this.setCurrentWebId( null );
        }
    }

    didNavigateInPage( e )
    {
        const { updateTab, index } = this.props;
        const { url } = e;
        const noTrailingSlashUrl = removeTrailingSlash( url );

        logger.info(
            'Webview: did navigate in page',
            url,
            this.state.browserState.url
        );

        // TODO: Actually overwrite history for redirect
        if ( !this.state.browserState.redirects.includes( url ) )
        {
            if ( urlHasChanged( url, this.state.browserState.url ) )
            {
                this.updateBrowserState( { url, redirects: [ url ] } );
                updateTab( { index, url } );

                this.setCurrentWebId( null );
            }
        }
    }

    didGetRedirectRequest( e )
    {
        const { oldURL, newURL } = e;

        const prev = oldURL;
        const next = newURL;

        logger.info( 'Webview: did get redirect request' );

        if ( prev === this.state.browserState.url )
        {
            this.updateBrowserState( { redirects: [ next ] } );
        }
    }

    willNavigate( e )
    {
        logger.info( 'webview will navigate', e );

        if ( this.isFrozen() )
        {
            logger.verbose('Webview is frozen.')

            return;
        }

        const { url } = e;
        const { webview } = this;
        const { windowId } = this.props;

        if (
            this.lastNavigationUrl === url
            && e.timeStamp - this.lastNavigationTimeStamp
                < WILL_NAVIGATE_GRACE_PERIOD
        )
        {
            this.with( () =>
            {
                webview.stop();
                this.loadURL( url );
            } );
            return;
        }
        this.lastNavigationUrl = url;
        this.lastNavigationTimeStamp = e.timeStamp;

        const index = this.props.index;

        this.props.updateTab( { index, url } );

        if ( this.props.isActiveTab )
        {
            this.props.updateTab( { windowId, url } );
        }

    }

    // TODO Move this functinoality to extensions
    updateTheIdInWebview = newWebId =>
    {
        const { updateTab, index, webId } = this.props;
        const { webview } = this;

        const theWebId = newWebId || webId;

        logger.info( 'Setting currentWebid in tab' );

        if ( !webview || !theWebId ) return;

        const setupEventEmitter = `
            webIdUpdater = () =>
            {
                // check for experiments set...
                if( ! safeExperimentsEnabled )
                    return;

                console.warn(
                    \`%cSAFE Browser Experimental Feature
%cThe webIdEventEmitter and window.currentWebId are experimental features.
They may be deprecated or change in future.

For updates or to submit ideas and suggestions, visit https://github.com/maidsafe/safe_browser\`,
                'font-weight: bold',
                'font-weight: normal'
                );

                var oldWebId_Id = '';
                var currentIdDefined = typeof window.currentWebId !== 'undefined';

                if( currentIdDefined )
                {
                    oldWebId_Id = window.currentWebId['@id'];
                }

                window.currentWebId = ${ JSON.stringify( theWebId ) };

                if( typeof webIdEventEmitter !== 'undefined' &&
                    oldWebId_Id !== window.currentWebId['@id'] )
                    {
                        webIdEventEmitter.emit('update', currentWebId );
                    }
            }

            webIdUpdater();
        `;

        webview.executeJavaScript( setupEventEmitter );
    };

    setCurrentWebId( newWebId )
    {
        // TODO: move webId func into extensions
        const { safeExperimentsEnabled } = this.props;

        if ( safeExperimentsEnabled )
        {
            this.debouncedWebIdUpdateFunc( newWebId );
        }
    }

    newWindow( e )
    {
        const { addTab } = this.props;
        const { url } = e;
        logger.info( 'Tab: NewWindow event triggered for url: ', url );

        const activateTab = e.disposition == 'foreground-tab';

        addTab( { url, isActiveTab: activateTab } );

        this.goForward();
    }

    isFrozen( e )
    {
        logger.info( 'Webview is frozen...' );
        const { index } = this.props;
        const frozen = !index;
        // const frozen = staticTabData[index] || !index
        return frozen;
    }

    with( cb, opts = { insist: false } )
    {
        const { webview } = this;
        if ( !webview ) return;

        const webContents = webview.getWebContents();
        if ( !webContents )
        {
            return;
        }

        if ( webContents.isDestroyed() ) return;

        cb( webview, webContents );
    }

    openDevTools()
    {
        this.with( ( wv, wc ) => wc.openDevTools( { mode: 'detach' } ) );
    }

    closeDevTools()
    {
        this.with( ( wv, wc ) => wc.closeDevTools() );
    }

    stop()
    {
        this.with( wv => wv.stop() );
    }

    reload()
    {
        logger.info( 'webview reloading' );

        this.with( wv =>
        {
            wv.reload();
        } );
    }

    goBack( e )
    {
        this.with( wv => wv.goBack() );
    }

    goForward()
    {
        console.warn(
            'Electron bug preventing goForward: https://github.com/electron/electron/issues/9999'
        );
        this.with( wv => wv.goForward() );
    }

    loadURL = async input =>
    {
        const { webview } = this;
        const url = addTrailingSlashIfNeeded( input );
        logger.info( 'Webview: loading url:', url );

        // if ( !urlHasChanged( this.state.browserState.url, url) )
        // {
        //     logger.info( 'not loading URL as it has not changed');
        //     return;
        // }

        const browserState = { ...this.state.browserState, url };
        this.setState( { browserState } );

        // prevent looping over attempted url loading

        if ( webview )
        {
            webview.loadURL( url );
        }
    };

    render()
    {
        const { isActiveTab } = this.props;

        const preloadFile = remote ? remote.getGlobal( 'preloadFile' ) : '';
        const injectPath = preloadFile; // js we'll be chucking in

        let moddedClass = styles.tab;
        if ( isActiveTab )
        {
            moddedClass = styles.activeTab;
        }

        return (
            <div className={ moddedClass }>
                <webview
                    style={ { height: '100%', display: 'flex', flex: '1 1' } }
                    tabIndex="0"
                    preload={ injectPath }
                    partition="persist:safe-tab"
                    ref={ c =>
                    {
                        this.webview = c;
                    } }
                />
            </div>
        );
    }
}
