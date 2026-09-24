# Belt Guardian - Machine-wise Alert Rules with Telegram

This document describes the new machine-wise threshold monitoring feature with Telegram notifications.

## Overview

This feature allows operators to set custom thresholds for each machine in the conveyor belt system. When a machine's metric (load, risk, or servicing probability) exceeds the configured threshold, a Telegram notification is sent to the operator.

## Key Features

- **Per-machine threshold configuration**: Set different thresholds for each machine
- **Custom messages**: Customize the content of Telegram notifications
- **Multiple metrics**: Monitor load percentage, servicing probability, or risk level
- **Operator and admin roles**: Only users with operator/admin permissions can configure alerts
- **Alert history**: All threshold breaches are logged in the system
- **Telegram integration**: Real-time notifications sent via Telegram bot

## Data Model

### alert_rules table
- `id`: UUID, primary key
- `user_id`: UUID, references auth.users (the user who created the rule)
- `machine_id`: TEXT, the name of the belt/machine (for lookup in conveyor_belts)
- `metric`: TEXT, one of: 'servicing_probability', 'load_percentage', 'risk_level'
- `threshold_value`: NUMERIC, the threshold value that triggers an alert
- `operator`: TEXT, 'gt' (greater than) or 'gte' (greater than or equal)
- `message_template`: TEXT, customizable message template with placeholders
- `enabled`: BOOLEAN, whether the rule is active
- `created_at`: TIMESTAMP, when the rule was created

### Relationships

1. `alert_rules.machine_id` references `conveyor_belts.name`
2. `alert_rules.user_id` references `auth.users.id`
3. The feature is gated by user roles (only operators and admins can configure rules)

## Usage

### Setting Up a Telegram Bot

1. Create a bot with @BotFather on Telegram
2. Get the bot token (e.g., `1234567890:ABCDefGhIjKlMnOpQrStUvWxYz`)
3. Get the chat ID where you want to receive notifications (can get from @userinfobot or by sending a message to the bot)

### Configuring Telegram Environment Variables

In your Supabase project:
- `TELEGRAM_BOT_TOKEN`: Your bot's token
- `TELEGRAM_CHAT_ID`: The chat ID where notifications will be sent

### Configuring Alert Rules

Users with operator or admin roles can configure alert rules via:

1. Navigate to the Belt Detail page
2. Click the "Create work order" button to expand the configuration area
3. Add a new card with the following fields:

- **Metric**: Select the metric to monitor
  - `servicing_probability`: AI-predicted maintenance probability
  - `load_percentage`: Current load on the belt
  - `risk_level`: Risk score (0-100%)

- **Threshold Value**: The value that will trigger the alert

- **Operator**: Comparison type
  - `gt`: Greater than (>)
  - `gte`: Greater than or equal to (>=)

- **Message Template**: Customizable message with placeholders
  - `{{machine_name}}`: Name of the machine
  - `{{metric}}`: The metric being monitored
  - `{{value}}`: Current value
  - `{{threshold}}`: Threshold value

4. Save the rule and it will be immediately active

### How Alert Rules Work

1. **Trigger**: The `check-thresholds` edge function is invoked via Supabase Realtime triggers when:
   - A new sensor reading is inserted
   - A prediction is added/updated

2. **Evaluation**: The function loads all active alert rules for the affected machine and:
   - Gets the current metric value (from sensor readings or predictions)
   - Checks if the value crosses the threshold
   - If triggered, sends a Telegram notification

3. **Notification**: When a threshold is crossed:
   - Telegram Bot API is called with the custom message
   - An alert is created in the `alerts` table
   - Optionally a work order can be created

4. **Recovery**: When values return to normal, new readings may trigger new alerts if thresholds are still crossed

## Message Templates Examples

### Load threshold
```
"⚠️ High load alert for {{machine_name}}: {{value}}% exceeds threshold of {{threshold}}%"
```

### Risk level
```
"🚨 Critical risk detected for {{machine_name}}: {{value}}% exceeds safe limit of {{threshold}}%"
```

### Servicing probability
```
"⚠️ Servicing probability for {{machine_name}} is {{value}}%, above threshold of {{threshold}}%"
```

## Configuration Example

```json
{
  "machine_id": "Conveyor-Belt-A",
  "metric": "load_percentage",
  "threshold_value": 85,
  "operator": "gt",
  "message_template": "⚠️ High load on {{machine_name}}: {{value}}% exceeds safe limit of {{threshold}}%"
}
```

## Best Practices

1. **Use descriptive message templates**: Include machine names and values for clarity
2. **Test threshold values**: Start with conservative values and adjust based on real data
3. **Consider alert fatigue**: Use high thresholds for less critical metrics
4. **Include recovery info**: Add messages for when values return to normal
5. **Rate-limit alerts**: Consider implementing cooldown periods between alerts

## Environment Setup

### Required Supabase Secrets:
- `GROQ_API_KEY`: Your Groq API key (for AI services)
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: The Telegram chat ID

### Optional Environment Variables:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase anon key (used internally)

## Testing

You can test the alert system manually by:

1. Configuring an alert rule for a machine
2. Simulating a sensor reading that exceeds the threshold
3. Checking that a Telegram notification is received
4. Verifying the alert appears in the system

## Dependencies

- Deno edge functions
- Supabase Realtime
- Telegram Bot API
- Groq API (for AI analysis)

## Future Enhancements

1. **Alert throttling**: Prevent spam by implementing cooldown periods
2. **Custom schedules**: Allow time-based alert scheduling
3. **Webhook integration**: Allow notifications to external systems
4. **Dashboard integration**: Show active alerts on the dashboard
5. **Bulk operations**: Allow importing/exporting alert rules
