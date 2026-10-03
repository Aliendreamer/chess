# responsive-layout Specification

## Purpose

The site works from phone to desktop with one breakpoint: a rail on wide screens, a top bar with a menu below it, stacked game and study pages, and touch-sized controls.

## Requirements

### Requirement: Every page works from 360 px wide

Every page SHALL render without horizontal scrolling at viewport widths from 360 px up. Only code blocks and wide
tables MAY scroll inside their own container.

#### Scenario: History on a phone

- **WHEN** `/games` is opened at 390 px wide
- **THEN** `document.documentElement.scrollWidth` equals the viewport width, and each game shows as a two-line row

### Requirement: Below 900 px the rail becomes a top bar

At viewport widths under 900 px the navigation SHALL move into a top bar with the wordmark, a menu control that
reveals the navigation and the account links, and the user's initial. The menu MUST work without JavaScript. From
900 px up the rail SHALL be as today.

#### Scenario: Opening the menu on a phone

- **WHEN** a user taps the menu button at 390 px
- **THEN** Home, History, Studies, Settings and Log out are shown, and tapping one navigates

### Requirement: The game page stacks around a full-width board

Under 900 px the game page SHALL show, top to bottom: the opponent's strip, the board at full content width, the
player's strip, the navigation bar, the game controls, then the move list as a single horizontally scrolling line that
keeps the latest move in view.

#### Scenario: Playing on a phone

- **WHEN** a player opens a game at 390 px
- **THEN** the board is at least 358 px wide and both clocks are visible without scrolling

### Requirement: Touch targets are large enough

On devices whose primary pointer is coarse, every button, link styled as a button, and form control SHALL be at least
44 px tall.

#### Scenario: Controls on a touch screen

- **WHEN** the game page is shown on a touch device
- **THEN** Resign and Offer draw are each at least 44 px tall
