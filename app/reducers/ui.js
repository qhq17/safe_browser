// @flow
import { createActions } from 'redux-actions';
import { TYPES } from '@Actions/ui_actions';
import initialAppState from './initialAppState';

const initialState = initialAppState.ui;

export default function ui( state: array = initialState, action )
{
    const payload = action.payload;

    switch ( action.type )
    {
        case TYPES.SHOW_SETTINGS_MENU :
        {
            return { ...state, settingsMenuIsVisible : true };
        }
        case TYPES.HIDE_SETTINGS_MENU :
        {
            return { ...state, settingsMenuIsVisible : false };
        }
        case TYPES.SELECT_ADDRESS_BAR :
        {
            return { ...state, addressBarIsSelected : true };
        }
        case TYPES.DESELECT_ADDRESS_BAR :
        {
            return { ...state, addressBarIsSelected : false };
        }
        case TYPES.BLUR_ADDRESS_BAR :
        {
            return { ...state, addressBarIsSelected : false };
        }
        case TYPES.FOCUS_WEBVIEW :
        {
            return { ...state, shouldFocusWebview: payload };
        }

        default:
            return state;
    }
}
