# Product

The **Expense Report Web App** is a web application that allows authenticated users to create and manage expense reports.

## Core Functionality

- **Authentication**: Users log in with a username and password. Unauthenticated users are redirected to the login screen for all requests.
- **Dashboard**: Authenticated users see all their expense reports in one place, with an option to create new ones.
- **Expense Reports**: Users can submit reports with a title, purpose, and total amount. Submitted reports are saved with a `Pending` status.

## Key Domain Terms

- **Expense_Report**: A record with Title, Purpose, Total_Amount, and Status, associated with a user.
- **Status**: Current state of a report. Valid values: `Pending`.
- **Dashboard**: Main page listing the authenticated user's expense reports.
- **Create_Report_Form**: Form for entering new expense report details.
