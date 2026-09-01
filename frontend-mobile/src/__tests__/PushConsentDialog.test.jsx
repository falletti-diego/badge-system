import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PushConsentDialog from '../components/PushConsentDialog';

describe('PushConsentDialog', () => {
  it('renders nothing when not visible', async () => {
    const { queryByText } = await render(
      <PushConsentDialog visible={false} onAccept={jest.fn()} onDecline={jest.fn()} />
    );
    expect(queryByText('Attiva')).toBeNull();
  });

  it('calls onAccept when the employee taps Attiva', async () => {
    const onAccept = jest.fn();
    const { getByText } = await render(
      <PushConsentDialog visible={true} onAccept={onAccept} onDecline={jest.fn()} />
    );
    fireEvent.press(getByText('Attiva'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when the employee taps Non ora', async () => {
    const onDecline = jest.fn();
    const { getByText } = await render(
      <PushConsentDialog visible={true} onAccept={jest.fn()} onDecline={onDecline} />
    );
    fireEvent.press(getByText('Non ora'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('explains the benefit before the system prompt', async () => {
    const { getByText } = await render(
      <PushConsentDialog visible={true} onAccept={jest.fn()} onDecline={jest.fn()} />
    );
    expect(getByText(/cambi turno e approvazioni/i)).toBeTruthy();
  });
});
