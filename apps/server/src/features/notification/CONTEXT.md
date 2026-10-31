# notification: ubiquitous language

The words of the `notification` context. A word means one thing inside this context; the third column names the neighbour's word it must not be confused with.

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Notification | One entry in a person's inbox about something on a board: a reply, an assignment, a mention, a resolve, or an invitation. | Email, a separate delivery of some of the same events. |
| Inbox | A person's notifications, newest first. |  |
| Unread count | How many notifications the person has not marked read. |  |
| Mark read | Mark some or all of a person's notifications as read. |  |
| Email | A message sent to an address through the outbox. | Notification. |
| Outbox | The queue of messages and events, written in the same transaction as the change that caused them, so neither is lost nor sent without its change. |  |
| Dedupe key | The key that makes a second message for the same event a no-op, such as `mentioned:<commentId>:<personId>`. |  |
| Dead | An outbox message that failed its last attempt. It is never retried. |  |
