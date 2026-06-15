import React, { useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Tooltip title={copied ? 'Copiato!' : 'Copia'}>
      <IconButton size="small" onClick={handle}>
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
