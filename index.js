
const fs = require("fs");
const cron = require("node-cron");
const express = require("express");
const ProgressBar = require('progress');
const octokit = require('@octokit/rest')();

require('dotenv').config({path: `${__dirname}/.env`});

octokit.authenticate({
  type: 'token',
  token: process.env.GITHUB_ACCESS_TOKEN
});

app = express();

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
  const bar = new ProgressBar(':bar :percent :current', { total: extraneousNotifications.length });

  for (let i = 0; i < extraneousNotifications.length; i++) {
    const notification = extraneousNotifications[i];

    bar.interrupt(
        `Marking ${notification.subject.url} ${
          notification.subject.title
        } as read.`
    );

    const thread = await octokit.activity.markNotificationThreadAsRead({
      thread_id: notification.id
    });

    bar.tick();

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`Fin. Marked ${extraneousNotifications.length} notifications as read! 😌`)
}

cron.schedule("15 * * * *", function() {
  console.log("running a task every minute");
});

app.listen(3128);

// parseNotifications();
