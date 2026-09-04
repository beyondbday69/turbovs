// Turbo C++ Classic Conio Screen Animation
// Demonstrates gotoxy, textcolor, textbackground, delay, and kbhit

#include <conio.h>
#include <dos.h>
#include <stdio.h>

void main() {
    int x = 1, y = 10, dx = 1;
    int color = 1;

    textbackground(BLACK);
    clrscr();
    _setcursortype(_NOCURSOR);

    gotoxy(20, 2);
    textcolor(WHITE);
    cprintf("Turbo C++ Interactive Animation Demo");

    gotoxy(15, 4);
    textcolor(LIGHTGRAY);
    cprintf("Watch the bouncing banner! Press any key to stop...");

    while (!kbhit()) {
        // Clear previous position
        gotoxy(x, y);
        cprintf("                         ");

        // Move banner
        x += dx;
        if (x >= 50) {
            dx = -1;
            color = (color % 14) + 1;
        } else if (x <= 2) {
            dx = 1;
            color = (color % 14) + 1;
        }

        // Draw banner at new position
        gotoxy(x, y);
        textcolor(color);
        cprintf(">>> TURBO C++ IN VS CODE <<<");

        delay(40);
    }

    // Flush key
    getch();

    _setcursortype(_NORMALCURSOR);
    gotoxy(1, 22);
    textcolor(LIGHTGREEN);
    cprintf("\nAnimation stopped cleanly. Press any key to exit...");
    getch();
}
