// Matrix Operations in Legacy Turbo C++
// Demonstrates 2D arrays, loops, and formatted console output

#include <iostream.h>
#include <conio.h>

void main() {
    clrscr();

    int a[3][3], b[3][3], sum[3][3];
    int i, j;

    cout << "========================================" << endl;
    cout << "   Turbo C++: 2x2 Matrix Addition Demo  " << endl;
    cout << "========================================" << endl;
    cout << endl;

    cout << "Enter elements for Matrix A (2x2):" << endl;
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 2; j++) {
            cout << "  A[" << i << "][" << j << "]: ";
            cin >> a[i][j];
        }
    }

    cout << endl << "Enter elements for Matrix B (2x2):" << endl;
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 2; j++) {
            cout << "  B[" << i << "][" << j << "]: ";
            cin >> b[i][j];
        }
    }

    // Compute sum
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 2; j++) {
            sum[i][j] = a[i][j] + b[i][j];
        }
    }

    cout << endl;
    cout << "--- Result (A + B) ---" << endl;
    for (i = 0; i < 2; i++) {
        cout << "  | ";
        for (j = 0; j < 2; j++) {
            cout << sum[i][j] << " ";
        }
        cout << "|" << endl;
    }

    cout << endl << "Press any key to finish...";
    getch();
}
