import logger from 'logger';

import { default as safeWrapBrowser } from '@Extensions/safe/components/wrapBrowser';
import safeWrapAddressBarButtonsLHS from '@Extensions/safe/components/wrapAddressBarButtonsLHS';
import safeWrapAddressBarButtonsRHS from '@Extensions/safe/components/wrapAddressBarButtonsRHS';
import safeWrapAddressBarInput from '@Extensions/safe/components/wrapAddressBarInput';

const allBrowserExtensions = [ safeWrapBrowser ];
const allAddressBarButtonLHSExtensions = [ safeWrapAddressBarButtonsLHS ];
const allAddressBarButtonRHSExtensions = [ safeWrapAddressBarButtonsRHS ];
const allAddressBarInputExtensions = [ safeWrapAddressBarInput ];

/**
 * Wrap the browser with a HOC or replace it entirely.
 *
 * This is separate to the extensions/index file to prevent pulling in libs which will break tests
 *
 * @param  {React Component} Browser Browser react component
 * @param  {React Component} Browser Browser react component
 */
export const wrapBrowserComponent = Browser =>
{
    try
    {
        logger.info( 'Wrapping browser' );

        let WrappedBrowser = Browser;

        allBrowserExtensions.forEach( wrapper =>
        {
            WrappedBrowser = wrapper( Browser );
        } );

        return WrappedBrowser;
    }
    catch ( e )
    {
        console.error(
            'Problem with extension wrapping of the Browser component'
        );
        throw new Error( e );
    }
};

/**
 * Wrap the addressbar component or replace it entirely.
 *
 * This is separate to the extensions/index file to prevent pulling in libs which will break tests
 *
 * @param  {React Component} AddressBar AddressBar react component
 * @param  {React Component} AddressBar AddressBar react component
 */
export const wrapAddressBarButtonsLHS = Buttons =>
{
    try
    {
        logger.info( 'Wrapping Address bar buttons LHS' );
        let WrappedAddressBarButtonsLHS = Buttons;

        allAddressBarButtonLHSExtensions.forEach( wrapper =>
        {
            WrappedAddressBarButtonsLHS = wrapper( Buttons );
        } );

        return WrappedAddressBarButtonsLHS;
    }
    catch ( e )
    {
        console.error(
            'Problem with extension wrapping of Addressbar Buttons component'
        );
        throw new Error( e );
    }
};
/**
 * Wrap the addressbar component or replace it entirely.
 *
 * This is separate to the extensions/index file to prevent pulling in libs which will break tests
 *
 * @param  {React Component} AddressBar AddressBar react component
 * @param  {React Component} AddressBar AddressBar react component
 */
export const wrapAddressBarButtonsRHS = Buttons =>
{
    try
    {
        logger.info( 'Wrapping Address bar buttons RHS' );
        let WrappedAddressBarButtonsRHS = Buttons;

        allAddressBarButtonRHSExtensions.forEach( wrapper =>
        {
            WrappedAddressBarButtonsRHS = wrapper( Buttons );
        } );

        return WrappedAddressBarButtonsRHS;
    }
    catch ( e )
    {
        console.error(
            'Problem with extension wrapping of Addressbar Buttons RHS component'
        );
        throw new Error( e );
    }
};

/**
 * Wrap the addressbar input component.
 *
 * This is separate to the extensions/index file to prevent pulling in libs which will break tests
 *
 * @param  {React Component} AddressBar react component
 */
export const wrapAddressBarInput = AddressBarInput =>
{
    try
    {
        logger.info( 'Wrapping Address bar input' );
        let WrappedAddressBarInput = AddressBarInput;

        allAddressBarInputExtensions.forEach( wrapper =>
        {
            WrappedAddressBarInput = wrapper( AddressBarInput );
        } );

        return WrappedAddressBarInput;
    }
    catch ( e )
    {
        console.error(
            'Problem with extension wrapping of Addressbar input component'
        );
        throw new Error( e );
    }
};
