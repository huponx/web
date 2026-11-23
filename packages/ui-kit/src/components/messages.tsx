import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/** The texts the shared components of the kit show on their own (the app passes its translations once, at the root). */
export interface UiMessages {
  loading: string;
  somethingWrong: string;
  required: string;
  invalidEmail: string;
  invalidFormat: string;
  clearField: (label: string) => string;
  empty: string;
  close: string;
  loadMore: string;
  none: string;
  /** The date and time pickers. */
  pickers: PickerMessages;
}

export interface PickerMessages {
  select: string;
  selectDate: string;
  selectTime: string;
  selectDateTime: string;
  today: string;
  tomorrow: string;
  now: string;
  clear: string;
  apply: string;
  cancel: string;
  done: string;
  previousMonth: string;
  nextMonth: string;
  hour: string;
  minute: string;
  date: string;
  time: string;
}

export const defaultMessages: UiMessages = {
  loading: "Loading…",
  somethingWrong: "Something went wrong.",
  required: "This field is required.",
  invalidEmail: "Enter a valid email address.",
  invalidFormat: "The format is not valid.",
  clearField: (label) => `Clear ${label}`,
  empty: "Nothing to show.",
  close: "Close",
  loadMore: "Load more",
  none: "None",
  pickers: {
    select: "Select",
    selectDate: "Select date",
    selectTime: "Select time",
    selectDateTime: "Date and time",
    today: "Today",
    tomorrow: "Tomorrow",
    now: "Now",
    clear: "Clear",
    apply: "Apply",
    cancel: "Cancel",
    done: "Done",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    hour: "Hour",
    minute: "Minute",
    date: "Date",
    time: "Time",
  },
};

const MessagesContext = createContext<UiMessages>(defaultMessages);

/** Gives the shared components their texts in the language of the app; without it they are in English. */
export function UiMessagesProvider({ value, children }: { value: Partial<UiMessages>; children: ReactNode }) {
  return <MessagesContext.Provider value={{ ...defaultMessages, ...value, pickers: { ...defaultMessages.pickers, ...value.pickers } }}>{children}</MessagesContext.Provider>;
}

export function useUiMessages(): UiMessages {
  return useContext(MessagesContext);
}
