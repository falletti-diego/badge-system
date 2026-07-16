'use strict';

/**
 * Unit tests for utils/email.js — the minimal AWS SES wrapper used by
 * POST /demo/contact (Task 5 of 9 — Ambiente Demo Self-Service).
 *
 * Mocks @aws-sdk/client-ses's SESClient/SendEmailCommand directly — this is
 * the first real AWS SDK usage in this backend (AWS_ACCESS_KEY_ID etc. were
 * previously declared but unused), so there is no existing in-repo pattern
 * for mocking it; this mirrors how the SDK's own v3 client/command/`.send()`
 * shape is normally tested (mock the client's `send` method).
 */

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

const { sendEmail } = require('../utils/email');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

describe('utils/email.sendEmail', () => {
  beforeEach(() => {
    mockSend.mockReset();
    SESClient.mockClear();
    SendEmailCommand.mockClear();
  });

  it('sends an email via SES with the given to/subject/text', async () => {
    mockSend.mockResolvedValue({ MessageId: 'abc-123' });

    await sendEmail({
      to: 'notify@dataxiom.it',
      subject: 'Nuova richiesta di contatto dalla demo',
      text: 'prospect@example.com ha scritto: ciao',
    });

    expect(SendEmailCommand).toHaveBeenCalledTimes(1);
    const [commandInput] = SendEmailCommand.mock.calls[0];
    expect(commandInput.Destination.ToAddresses).toEqual(['notify@dataxiom.it']);
    expect(commandInput.Message.Subject.Data).toBe('Nuova richiesta di contatto dalla demo');
    expect(commandInput.Message.Body.Text.Data).toBe('prospect@example.com ha scritto: ciao');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('propagates a rejection from SES to the caller (no swallowing)', async () => {
    mockSend.mockRejectedValue(new Error('SES throttled'));

    await expect(
      sendEmail({ to: 'notify@dataxiom.it', subject: 'x', text: 'y' })
    ).rejects.toThrow('SES throttled');
  });
});
