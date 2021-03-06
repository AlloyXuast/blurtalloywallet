import React from 'react'
import { Link, browserHistory } from 'react-router'
import { connect } from 'react-redux'
import PropTypes from 'prop-types'

import tt from 'counterpart'
import DropdownMenu from 'app/components/elements/DropdownMenu'
import Icon from 'app/components/elements/Icon'
import * as userActions from 'app/redux/UserReducer'
import * as appActions from 'app/redux/AppReducer'
import Userpic from 'app/components/elements/Userpic'
import LoadingIndicator from 'app/components/elements/LoadingIndicator'
import { SIGNUP_URL } from 'shared/constants'

const defaultNavigate = (e) => {
  if (e.metaKey || e.ctrlKey) {
    // prevent breaking anchor tags
  } else {
    e.preventDefault()
  }
  const a =
        e.target.nodeName.toLowerCase() === 'a'
          ? e.target
          : e.target.parentNode
  browserHistory.push(a.pathname + a.search + a.hash)
}

function TopRightMenu ({
  username,
  showLogin,
  logout,
  loggedIn,
  vertical,
  navigate,
  toggleOffCanvasMenu,
  probablyLoggedIn,
  nightmodeEnabled,
  toggleNightmode,
  userPath
}) {
  const mcn = 'menu' + (vertical ? ' vertical show-for-small-only' : '')
  const mcl = vertical ? '' : ' sub-menu'
  const lcn = vertical ? '' : 'show-for-medium'
  const nav = navigate || defaultNavigate
  const submit_story = $STM_Config.read_only_mode
    ? null
    : (
      <li className={lcn + ' submit-story' + (vertical ? ' last' : '')}>
        <a href='/submit.html' onClick={nav}>
          {tt('g.submit_a_story')}
        </a>
      </li>
      )
  const submit_icon = $STM_Config.read_only_mode
    ? null
    : (
      <li className='show-for-small-only'>
        <Link to='/submit.html'>
          <Icon name='pencil2' />
        </Link>
      </li>
      )
  const wallet_link = `/@${username}/transfers`
  const account_link = `/@${username}`
  const reset_password_link = `/@${username}/password`
  const settings_link = `/@${username}/settings`
  const pathCheck = userPath === '/submit.html' ? true : null
  if (loggedIn) {
    // change back to if(username) after bug fix:  Clicking on Login does not cause drop-down to close #TEMP!
    const user_menu = [
      { link: account_link, icon: 'profile', value: tt('g.blog') },
      {
        link: wallet_link,
        icon: 'wallet',
        value: tt('g.wallet')
      },
      {
        link: '#',
        icon: 'eye',
        onClick: toggleNightmode,
        value: tt('g.toggle_nightmode')
      },
      {
        link: reset_password_link,
        icon: 'password',
        value: tt('g.change_password')
      },
      { link: settings_link, icon: 'cog', value: tt('g.settings') },
      loggedIn
        ? {
            link: '#',
            icon: 'enter',
            onClick: logout,
            value: tt('g.logout')
          }
        : { link: '#', onClick: showLogin, value: tt('g.login') }
    ]
    return (
      <ul className={mcn + mcl}>
        {!pathCheck ? submit_story : null}
        {!vertical && submit_icon}
        {!vertical && (
          <DropdownMenu
            className='Header__usermenu'
            items={user_menu}
            title={username}
            el='span'
            selected={tt('g.rewards')}
            position='left'
          >
            <li className='Header__userpic '>
              <span title={username}>
                <Userpic account={username} />
              </span>
            </li>
          </DropdownMenu>
        )}

        {toggleOffCanvasMenu && (
          <li className='toggle-menu Header__hamburger'>
            <a href='#' onClick={toggleOffCanvasMenu}>
              <span className='hamburger' />
            </a>
          </li>
        )}
      </ul>
    )
  }
  if (probablyLoggedIn) {
    return (
      <ul className={mcn + mcl}>
        <li className={lcn} style={{ paddingTop: 0, paddingBottom: 0 }}>
          <LoadingIndicator type='circle' inline />
        </li>
        {toggleOffCanvasMenu && (
          <li className='toggle-menu Header__hamburger'>
            <a href='#' onClick={toggleOffCanvasMenu}>
              <span className='hamburger' />
            </a>
          </li>
        )}
      </ul>
    )
  }
  return (
    <ul className={mcn + mcl}>
      <li className={lcn}>
        <a href={SIGNUP_URL}>{tt('g.sign_up')}</a>
      </li>
      <li className={lcn}>
        <a href='/login.html' onClick={showLogin}>
          {tt('g.login')}
        </a>
      </li>
      {submit_story}
      {!vertical && submit_icon}
      {toggleOffCanvasMenu && (
        <li className='toggle-menu Header__hamburger'>
          <a href='#' onClick={toggleOffCanvasMenu}>
            <span className='hamburger' />
          </a>
        </li>
      )}
    </ul>
  )
}

TopRightMenu.propTypes = {
  username: PropTypes.string,
  loggedIn: PropTypes.bool,
  probablyLoggedIn: PropTypes.bool,
  showLogin: PropTypes.func.isRequired,
  logout: PropTypes.func.isRequired,
  vertical: PropTypes.bool,
  navigate: PropTypes.func,
  toggleOffCanvasMenu: PropTypes.func,
  nightmodeEnabled: PropTypes.bool,
  toggleNightmode: PropTypes.func
}

export default connect(
  (state) => {
    if (!process.env.BROWSER) {
      return {
        username: null,
        loggedIn: false,
        probablyLoggedIn: !!state.offchain.get('account')
      }
    }
    const userPath = state.routing.locationBeforeTransitions.pathname
    const username = state.user.getIn(['current', 'username'])
    const loggedIn = !!username
    return {
      username,
      loggedIn,
      userPath,
      probablyLoggedIn: false,
      nightmodeEnabled: state.user.getIn([
        'user_preferences',
        'nightmode'
      ])
    }
  },
  (dispatch) => ({
    showLogin: (e) => {
      if (e) e.preventDefault()
      dispatch(userActions.showLogin())
    },
    logout: (e) => {
      if (e) e.preventDefault()
      dispatch(userActions.logout({ type: 'default' }))
    },
    toggleNightmode: (e) => {
      if (e) e.preventDefault()
      dispatch(appActions.toggleNightmode())
    }
  })
)(TopRightMenu)
