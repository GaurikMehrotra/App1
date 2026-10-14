import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Auth } from './Auth';
jest.mock('./session', () => ({ api: null, useSession: () => ({ t: jest.requireActual('@campus/core').strings.en, locale: 'en', setLocale: jest.fn(), profile: null, refresh: jest.fn() }) }));
test('requires a real backend and never creates a fake session', async () => { render(<Auth />); expect(screen.getByText(/Backend not configured/)).toBeTruthy(); fireEvent.changeText(screen.getByLabelText('College email'), 'student@demo.example.edu'); fireEvent.press(screen.getByRole('button', { name: 'Send verification code' })); expect(await screen.findByText(/Connect Supabase using/)).toBeTruthy(); });
