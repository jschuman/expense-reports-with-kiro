/**
 * EmptyState — displayed on the Dashboard when the user has no expense reports.
 * Renders an inbox icon and a descriptive message.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InboxIcon from '@mui/icons-material/Inbox';

export function EmptyState() {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      py={8}
      color="text.secondary"
    >
      <InboxIcon sx={{ fontSize: 64, mb: 2, opacity: 0.4 }} />
      <Typography variant="h6" gutterBottom>
        No expense reports yet
      </Typography>
      <Typography variant="body2">
        Create your first report using the button above.
      </Typography>
    </Box>
  );
}
