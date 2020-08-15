import React from 'react';

import {
  screen, waitFor, waitForElementToBeRemoved
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderComponentUnderTest } from 'mocks';
import Signup from './signup';

describe('Signup Page', () => {
  const subjectsUnderTest = () => {
    const heading = screen.getByRole('heading', {
      name: /create your account/i
    });

    const firstName = screen.getByPlaceholderText(/First name/i);
    const email = screen.getByPlaceholderText(/email - jane@test.com/i);
    const password = screen.getByPlaceholderText(/password/i);
    const submit = screen.getByRole('button', { name: /submit/i });
    return { heading, firstName, email, password, submit };
  };

  const renderPage = () => {
    return renderComponentUnderTest(
      <Signup />,
      { initialEntries: ['/signup'] }
    );
  };

  it('should render signup form', async () => {
    renderPage();
    const { heading, firstName, email, password, submit } = subjectsUnderTest();

    expect(heading).toBeInTheDocument();
    expect(firstName).toBeInTheDocument();
    expect(email).toBeInTheDocument();
    expect(password).toBeInTheDocument();
    expect(submit).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('should disallow form submit action on validating errors', async() => {
    renderPage();
    const { firstName, email, password, submit } = subjectsUnderTest();

    // click on first name, type anything, clear and tab out to trigger error(s)
    userEvent.click(firstName);
    expect(firstName).toHaveFocus();
    userEvent.type(firstName, 'will be cleared{backspace}{backspace}');
    userEvent.clear(firstName);
    userEvent.tab();

    await waitFor(() => {
      const firstnameCheck = screen.getByText(/don't be shy. tell us your first name/i);
      expect(firstnameCheck).toBeInTheDocument();
      expect(submit).toBeDisabled();
    });

    // click on email, type anything, clear and tab out to trigger error(s)
    userEvent.click(email);
    expect(email).toHaveFocus();
    userEvent.type(email, 'will be cleared{backspace}{backspace}');
    userEvent.clear(email);
    userEvent.tab();

    await waitFor(() => {
      const emailCheck = screen.getByText(/email is required/i);
      expect(emailCheck).toBeInTheDocument();
      expect(submit).toBeDisabled();
    });

    // click on password, type anything, clear and tab out to trigger error(s)
    userEvent.click(password);
    expect(password).toHaveFocus();
    userEvent.type(password, 'will be cleared{backspace}{backspace}');
    userEvent.clear(password);
    userEvent.tab();

    await waitFor(() => {
      const passwordCheck = screen.getByText(/passphrase is required/i);
      expect(passwordCheck).toBeInTheDocument();
      expect(submit).toBeDisabled();
    });

    // type short first name
    userEvent.type(firstName, 'f');
    expect(firstName).toHaveAttribute('value', 'f');
    await waitFor(() => {
      const firstnameCheck = screen.getByText(/must be longer than 2 characters/i);
      expect(firstnameCheck).toBeInTheDocument();
      expect(firstnameCheck).toHaveClass('error');
      expect(submit).toBeDisabled();
    });

    // clear the previous set first name
    userEvent.clear(firstName);
    // type long first name
    userEvent.type(firstName, 'firstnamefirstnamefirstname');
    expect(firstName).toHaveAttribute('value', 'firstnamefirstnamefirstname');
    await waitFor(() => {
      const firstnameCheck = screen.getByText(/nice try, nobody has a first name that long/i);
      expect(firstnameCheck).toBeInTheDocument();
      expect(firstnameCheck).toHaveClass('error');
      expect(submit).toBeDisabled();
    });

    // type invalid email and tab out to trigger error(s)
    userEvent.type(email, 'Hello, World!');
    // FIXME! either formik or rtl is eating space!
    expect(email).toHaveAttribute('value', 'Hello,World!');
    await waitFor(() => {
      const emailCheck = screen.getByText(/invalid email address/i);
      expect(emailCheck).toBeInTheDocument();
      expect(emailCheck).toHaveClass('error');
      expect(submit).toBeDisabled();
    });

    // type short password
    userEvent.type(password, 'pas');
    expect(password).toHaveAttribute('value', 'pas');
    await waitFor(() => {
      const passwordCheck = screen.getByText(/must be longer than 8 characters/i);
      expect(passwordCheck).toBeInTheDocument();
      expect(passwordCheck).toHaveClass('error');
      expect(submit).toBeDisabled();
    });

    // fill in correct details, submit button should be enabled
    userEvent.clear(firstName);
    userEvent.clear(email);
    userEvent.clear(password);

    userEvent.type(firstName, 'tester');
    userEvent.type(email, 'tester@testing.paradise');
    userEvent.type(password, 'password');

    await waitFor(() => {
      expect(firstName).toHaveAttribute('value', 'tester');
      expect(email).toHaveAttribute('value', 'tester@testing.paradise');
      expect(password).toHaveAttribute('value', 'password');
      expect(submit).toBeEnabled();
    });
  });

  it('should display error message on signup failure', async() => {
    renderPage();
    const { firstName, email, password, submit } = subjectsUnderTest();

    userEvent.type(firstName, 'tester');
    userEvent.type(email, 'tester@testing.paradise');
    userEvent.type(password, 'password');
    userEvent.click(submit);
    await waitFor(() => {
      const serverError = screen.getByText(/email must be unique/i);
      expect(serverError).toBeInTheDocument();
    });
  });

  it('should navigate to login page on signup success', async() => {
    renderPage();
    const { firstName, email, password, submit } = subjectsUnderTest();

    userEvent.type(firstName, 'User');
    userEvent.type(email, 'user2@example.org');
    userEvent.type(password, '709$3cR31');

    const login = screen.getByText(/login/i);
    expect(login).toBeInTheDocument();
    userEvent.click(submit);

    await waitForElementToBeRemoved(login);
    // login is gone from dom! instead of looking for its absence
    // check for the presence of another element that appears due
    // to state transition

    await waitFor(() => {
      const signup = screen.getByText(/signup/i);
      expect(signup).toBeInTheDocument();
      expect(signup).toHaveClass('icon-user-add');
    });
  });
});
