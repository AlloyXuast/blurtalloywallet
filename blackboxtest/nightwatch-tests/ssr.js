const http = require('http')

module.exports = {
  'Ensure all of the standard routes return HTTP 200': (browser) => {
    browser.end(); // Not needed.
    [
      '/',
      '/trending',
      '/created',
      '/hot',
      '/promoted',
      '/about.html',
      '/faq.html',
      '/login.html',
      '/privacy.html',
      '/support.html',
      '/tos.html',
      '/change_password',
      '/create_account',
      '/approval',
      '/recover_account_step_1',
      '/recover_account_step_2',
      '/waiting_list.html',
      '/~witnesses',
      '/submit.html',
      '/proposals'
    ].forEach((path) => testHttpGet('localhost', 8080, path, browser))
  }
}

const testHttpGet = (host, port, path, browser) => {
  http.request(
    {
      host,
      port,
      path,
      method: 'GET'
    },
    (res) => {
      browser.assert.equal(
        res.statusCode,
        200,
                `Response for ${path} is 200`
      )
    }
  )
    .setTimeout(30000, () => {
      browser.assert.equal(
        true,
        false,
                `request for ${path} took more than 30 seconds`
      )
    })
    .on('error', (err) => {
      browser.assert.equal(true, false, err)
    })
    .end()
}
