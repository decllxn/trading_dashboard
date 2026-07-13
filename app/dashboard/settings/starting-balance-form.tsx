'use client';

import { useFormState } from 'react-dom';
import { Input, Label } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { saveStartingBalance, type StartingBalanceState } from './actions';

interface StartingBalanceFormProps {
  /** Current stored value (already resolved to the default if unset). */
  defaultValue: string;
}

/**
 * Starting-capital editor. The value drives the dashboard equity curve's
 * baseline (starting capital + cumulative closed-trade P&L). Submits via a
 * server action that upserts into user_settings; an empty field reverts to the
 * app default.
 */
export function StartingBalanceForm({ defaultValue }: StartingBalanceFormProps) {
  const [state, formAction] = useFormState<StartingBalanceState, FormData>(
    saveStartingBalance,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <Label htmlFor="startingBalance">Starting balance (account currency)</Label>
      <div className="flex items-center gap-3">
        <Input
          id="startingBalance"
          name="startingBalance"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          defaultValue={defaultValue}
          placeholder="10000"
        />
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
      <p className="text-tertiary text-xs">
        Used as the equity-curve baseline on the dashboard. Leave empty to use
        the default.
      </p>
      {state.error ? (
        <p className="text-loss text-xs">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-accent-signal text-xs">Starting balance saved.</p>
      ) : null}
    </form>
  );
}
