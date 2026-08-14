-- Read-only SQLite examples for aggregate product reporting.
-- Never project user/installation IDs, hashes, email, receipt/AI content,
-- tokens, payment identifiers, or the complete event properties object.
-- Unique-person metrics intentionally exclude rows whose user_id and
-- installation_id were both irreversibly cleared by opt-out.

-- Ordered activation funnel. Foodler records the two policy acceptances before
-- app_opened on first consent; registration is optional for local-first use.
WITH identities AS (
    SELECT
        CASE
            WHEN user_id IS NOT NULL THEN 'user:' || user_id
            ELSE 'install:' || installation_id
        END AS identity,
        event_name,
        MIN(occurred_at) AS first_at
    FROM analytics_events
    WHERE user_id IS NOT NULL OR installation_id IS NOT NULL
    GROUP BY identity, event_name
),
milestones AS (
    SELECT
        identity,
        MIN(CASE WHEN event_name = 'policy_accepted' THEN first_at END) AS consented_at,
        MIN(CASE WHEN event_name = 'app_opened' THEN first_at END) AS opened_at,
        MIN(CASE WHEN event_name = 'registration_succeeded' THEN first_at END) AS registered_at,
        MIN(
            CASE
                WHEN event_name IN ('receipt_capture_succeeded', 'receipt_manual_created')
                THEN first_at
            END
        ) AS receipt_at
    FROM identities
    GROUP BY identity
),
ordered AS (
    SELECT
        identity,
        consented_at,
        CASE
            WHEN opened_at >= consented_at THEN opened_at
        END AS opened_at,
        CASE
            WHEN registered_at >= opened_at THEN registered_at
        END AS registered_at,
        CASE
            WHEN receipt_at >= opened_at THEN receipt_at
        END AS receipt_at
    FROM milestones
)
SELECT 1 AS step, 'policy_accepted' AS event_name, COUNT(consented_at) AS identities
FROM ordered
UNION ALL
SELECT 2, 'app_opened', COUNT(opened_at) FROM ordered
UNION ALL
SELECT 3, 'registration_succeeded', COUNT(registered_at) FROM ordered
UNION ALL
SELECT 4, 'first_receipt_created', COUNT(receipt_at) FROM ordered
ORDER BY step;

-- DAU / WAU / MAU by a prefixed, non-output identity key.
WITH activity AS (
    SELECT
        occurred_at,
        CASE
            WHEN user_id IS NOT NULL THEN 'user:' || user_id
            ELSE 'install:' || installation_id
        END AS identity
    FROM analytics_events
    WHERE user_id IS NOT NULL OR installation_id IS NOT NULL
)
SELECT date(occurred_at) AS day, COUNT(DISTINCT identity) AS dau
FROM activity
GROUP BY day
ORDER BY day;

WITH activity AS (
    SELECT
        occurred_at,
        CASE
            WHEN user_id IS NOT NULL THEN 'user:' || user_id
            ELSE 'install:' || installation_id
        END AS identity
    FROM analytics_events
    WHERE user_id IS NOT NULL OR installation_id IS NOT NULL
)
SELECT strftime('%Y-%W', occurred_at) AS week, COUNT(DISTINCT identity) AS wau
FROM activity
GROUP BY week
ORDER BY week;

WITH activity AS (
    SELECT
        occurred_at,
        CASE
            WHEN user_id IS NOT NULL THEN 'user:' || user_id
            ELSE 'install:' || installation_id
        END AS identity
    FROM analytics_events
    WHERE user_id IS NOT NULL OR installation_id IS NOT NULL
)
SELECT strftime('%Y-%m', occurred_at) AS month, COUNT(DISTINCT identity) AS mau
FROM activity
GROUP BY month
ORDER BY month;

-- Installation cohort retention. Internal IDs are used only inside the CTEs.
WITH cohorts AS (
    SELECT id, date(first_seen_at) AS cohort_day
    FROM analytics_installations
),
cohort_sizes AS (
    SELECT cohort_day, COUNT(*) AS cohort_size
    FROM cohorts
    GROUP BY cohort_day
),
activity AS (
    SELECT DISTINCT installation_id, date(occurred_at) AS active_day
    FROM analytics_events
    WHERE installation_id IS NOT NULL
),
retention AS (
    SELECT
        cohorts.cohort_day,
        CAST(julianday(activity.active_day) - julianday(cohorts.cohort_day) AS INTEGER)
            AS day_offset,
        COUNT(DISTINCT activity.installation_id) AS retained
    FROM cohorts
    JOIN activity ON activity.installation_id = cohorts.id
    WHERE activity.active_day >= cohorts.cohort_day
    GROUP BY cohorts.cohort_day, day_offset
)
SELECT
    retention.cohort_day,
    retention.day_offset,
    cohort_sizes.cohort_size,
    retention.retained,
    ROUND(100.0 * retention.retained / cohort_sizes.cohort_size, 1) AS retention_pct
FROM retention
JOIN cohort_sizes USING (cohort_day)
ORDER BY retention.cohort_day, retention.day_offset;

-- Account cohort retention, anchored to the authoritative users.created_at.
WITH cohorts AS (
    SELECT id, date(created_at) AS cohort_day
    FROM users
),
cohort_sizes AS (
    SELECT cohort_day, COUNT(*) AS cohort_size
    FROM cohorts
    GROUP BY cohort_day
),
activity AS (
    SELECT DISTINCT user_id, date(occurred_at) AS active_day
    FROM analytics_events
    WHERE user_id IS NOT NULL
),
retention AS (
    SELECT
        cohorts.cohort_day,
        CAST(julianday(activity.active_day) - julianday(cohorts.cohort_day) AS INTEGER)
            AS day_offset,
        COUNT(DISTINCT activity.user_id) AS retained
    FROM cohorts
    JOIN activity ON activity.user_id = cohorts.id
    WHERE activity.active_day >= cohorts.cohort_day
    GROUP BY cohorts.cohort_day, day_offset
)
SELECT
    retention.cohort_day,
    retention.day_offset,
    cohort_sizes.cohort_size,
    retention.retained,
    ROUND(100.0 * retention.retained / cohort_sizes.cohort_size, 1) AS retention_pct
FROM retention
JOIN cohort_sizes USING (cohort_day)
ORDER BY retention.cohort_day, retention.day_offset;

-- Tab adoption. Only the allowlisted scalar `tab` property is extracted.
SELECT
    platform,
    app_version,
    json_extract(properties, '$.tab') AS tab,
    COUNT(*) AS views,
    COUNT(
        DISTINCT CASE
            WHEN user_id IS NOT NULL THEN 'user:' || user_id
            WHEN installation_id IS NOT NULL THEN 'install:' || installation_id
        END
    ) AS identities
FROM analytics_events
WHERE event_name = 'tab_viewed'
GROUP BY platform, app_version, tab
ORDER BY platform, app_version, tab;

-- Feature and AI-action adoption with safe dimensions only.
SELECT platform, app_version, event_name, COUNT(*) AS events
FROM analytics_events
WHERE event_name IN (
    'receipt_capture_succeeded',
    'receipt_manual_created',
    'receipt_detail_viewed',
    'ai_screen_viewed',
    'ai_action_succeeded',
    'subscription_screen_viewed',
    'feedback_submitted'
)
GROUP BY platform, app_version, event_name
ORDER BY platform, app_version, event_name;

SELECT
    platform,
    app_version,
    json_extract(properties, '$.actionId') AS action_id,
    COUNT(*) AS successful_actions
FROM analytics_events
WHERE event_name = 'ai_action_succeeded'
GROUP BY platform, app_version, action_id
ORDER BY platform, app_version, action_id;

-- Authoritative receipt and AI usage, based on server-owned timestamps.
SELECT date(created_at) AS day, COUNT(*) AS receipts, COUNT(DISTINCT user_id) AS users
FROM receipts
GROUP BY day
ORDER BY day;

SELECT date(created_at) AS day, action, COUNT(*) AS reports, COUNT(DISTINCT user_id) AS users
FROM ai_reports
GROUP BY day, action
ORDER BY day, action;

SELECT date(created_at) AS day, action, COUNT(*) AS credit_uses
FROM ai_credit_usage
GROUP BY day, action
ORDER BY day, action;

-- Pre-plan subscription adoption by the platform/version of the first screen.
WITH ranked_screens AS (
    SELECT
        user_id,
        platform,
        app_version,
        occurred_at,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY occurred_at) AS position
    FROM analytics_events
    WHERE event_name = 'subscription_screen_viewed' AND user_id IS NOT NULL
),
screens AS (
    SELECT user_id, platform, app_version, occurred_at AS screen_at
    FROM ranked_screens
    WHERE position = 1
),
selected AS (
    SELECT DISTINCT events.user_id
    FROM analytics_events AS events
    JOIN screens ON screens.user_id = events.user_id
    WHERE events.event_name = 'subscription_plan_selected'
      AND events.occurred_at >= screens.screen_at
),
checkout AS (
    SELECT DISTINCT events.user_id
    FROM analytics_events AS events
    JOIN screens ON screens.user_id = events.user_id
    WHERE events.event_name = 'subscription_checkout_opened'
      AND events.occurred_at >= screens.screen_at
)
SELECT
    screens.platform,
    screens.app_version,
    COUNT(*) AS screen_users,
    COUNT(selected.user_id) AS plan_selected_users,
    COUNT(checkout.user_id) AS checkout_users
FROM screens
LEFT JOIN selected USING (user_id)
LEFT JOIN checkout USING (user_id)
GROUP BY screens.platform, screens.app_version
ORDER BY screens.platform, screens.app_version;

-- Screen -> selected plan -> checkout -> authoritative successful payment and
-- active subscription. Payment/subscription timestamps are server-owned; no
-- mobile event is treated as proof of purchase.
WITH ranked_screens AS (
    SELECT
        user_id,
        platform,
        app_version,
        occurred_at,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY occurred_at) AS position
    FROM analytics_events
    WHERE event_name = 'subscription_screen_viewed' AND user_id IS NOT NULL
),
screens AS (
    SELECT user_id, platform, app_version, occurred_at AS screen_at
    FROM ranked_screens
    WHERE position = 1
),
selected AS (
    SELECT
        events.user_id,
        json_extract(events.properties, '$.plan') AS plan,
        MIN(events.occurred_at) AS selected_at
    FROM analytics_events AS events
    JOIN screens ON screens.user_id = events.user_id
    WHERE events.event_name = 'subscription_plan_selected'
      AND events.occurred_at >= screens.screen_at
    GROUP BY events.user_id, plan
),
checkout AS (
    SELECT
        events.user_id,
        json_extract(events.properties, '$.plan') AS plan,
        MIN(events.occurred_at) AS checkout_at
    FROM analytics_events AS events
    JOIN selected
      ON selected.user_id = events.user_id
     AND selected.plan = json_extract(events.properties, '$.plan')
    WHERE events.event_name = 'subscription_checkout_opened'
      AND events.occurred_at >= selected.selected_at
    GROUP BY events.user_id, plan
),
successful_payments AS (
    SELECT user_id, plan_id AS plan, MIN(created_at) AS paid_at
    FROM subcription_in_process
    WHERE status = 'success'
    GROUP BY user_id, plan_id
),
active_subscriptions AS (
    SELECT user_id, product_id AS plan, MIN(created_at) AS subscribed_at
    FROM subscriptions
    WHERE active = 1
    GROUP BY user_id, product_id
)
SELECT
    screens.platform,
    screens.app_version,
    selected.plan,
    COUNT(DISTINCT selected.user_id) AS selected_users,
    COUNT(DISTINCT checkout.user_id) AS checkout_users,
    COUNT(
        DISTINCT CASE
            WHEN successful_payments.paid_at >= checkout.checkout_at
            THEN successful_payments.user_id
        END
    ) AS paid_users,
    COUNT(
        DISTINCT CASE
            WHEN active_subscriptions.subscribed_at >= checkout.checkout_at
            THEN active_subscriptions.user_id
        END
    ) AS active_subscription_users
FROM selected
JOIN screens USING (user_id)
LEFT JOIN checkout
  ON checkout.user_id = selected.user_id
 AND checkout.plan = selected.plan
LEFT JOIN successful_payments
  ON successful_payments.user_id = selected.user_id
 AND successful_payments.plan = selected.plan
LEFT JOIN active_subscriptions
  ON active_subscriptions.user_id = selected.user_id
 AND active_subscriptions.plan = selected.plan
GROUP BY screens.platform, screens.app_version, selected.plan
ORDER BY screens.platform, screens.app_version, selected.plan;
