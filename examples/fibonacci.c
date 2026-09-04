/*
 * Fibonacci Series Generator in Turbo C
 * Classic C syntax with <stdio.h> and <conio.h>
 */

#include <stdio.h>
#include <conio.h>

void main() {
    int n, first = 0, second = 1, next, i;

    clrscr();

    printf("========================================\n");
    printf("   Turbo C - Fibonacci Series Demo      \n");
    printf("========================================\n\n");

    printf("Enter the number of terms (1 - 25): ");
    scanf("%d", &n);

    if (n <= 0) {
        printf("\nPlease enter a positive integer.\n");
    } else {
        printf("\nFibonacci Series (%d terms):\n", n);
        for (i = 0; i < n; i++) {
            if (i <= 1) {
                next = i;
            } else {
                next = first + second;
                first = second;
                second = next;
            }
            printf("%d ", next);
        }
        printf("\n");
    }

    printf("\nPress any key to return to VS Code...");
    getch();
}
