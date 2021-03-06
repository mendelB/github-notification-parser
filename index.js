const fs = require("fs");
const ProgressBar = require('progress');
const octokit = require('@octokit/rest')();

require('dotenv').config({path: `${__dirname}/.env`});

octokit.authenticate({
  type: 'token',
  token: process.env.GITHUB_ACCESS_TOKEN
});

// Pagination method, so we can fetch all notifications at once.
async function paginate(method) {
  let response = await method({ per_page: 100 });
  let { data } = response;

  while (octokit.hasNextPage(response)) {
    response = await octokit.getNextPage(response);
    data = data.concat(response.data);
  }

  return data;
}

async function parseNotifications() {
  const notifications = await paginate(octokit.activity.getNotifications);

  // Filter for extraneous notifications based on reason and keyword in URL.
  const extraneousNotifications = notifications.filter((notification) => (
    notification.reason === 'security_alert' && notification.subject.url.includes(process.env.KEYWORD)
  ));

  console.log(`Parsing ${extraneousNotifications.length} out of ${notifications.length} notifications`);

  const bar = process.env.APP_ENV !== 'production' ?
    new ProgressBar(':bar :percent :current', { total: extraneousNotifications.length }) 
    : null;

  for (let i = 0; i < extraneousNotifications.length; i++) {
    const notification = extraneousNotifications[i];
    const message = `Marking ${notification.subject.url} ${
          notification.subject.title
        } as read.`;

    bar ? bar.interrupt(message) : console.log(message);

    // Ignore further notifications from this repo entirely.
    await octokit.activity.setRepoSubscription({
      owner: notification.repository.owner.login,
      repo: notification.repository.name,
      ignored: true,
    });

    // Mark the notification as read.
    await octokit.activity.markNotificationThreadAsRead({
      thread_id: notification.id
    });

    bar && bar.tick();

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`Fin. Marked ${extraneousNotifications.length} notifications as read! 😌`)
}

parseNotifications();
