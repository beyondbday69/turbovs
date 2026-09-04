#include <iostream.h>
#include <conio.h>

void main() {
    clrscr();
    
    float num1, num2, result;
    char op;
    
    cout << "=== Turbo C++ Retro Calculator ===" << endl;
    cout << "Enter first number: ";
    cin >> num1;
    
    cout << "Enter operator (+, -, *, /): ";
    cin >> op;
    
    cout << "Enter second number: ";
    cin >> num2;
    
    switch (op) {
        case '+':
            result = num1 + num2;
            cout << "\nResult: " << num1 << " + " << num2 << " = " << result << endl;
            break;
        case '-':
            result = num1 - num2;
            cout << "\nResult: " << num1 << " - " << num2 << " = " << result << endl;
            break;
        case '*':
            result = num1 * num2;
            cout << "\nResult: " << num1 << " * " << num2 << " = " << result << endl;
            break;
        case '/':
            if (num2 != 0) {
                result = num1 / num2;
                cout << "\nResult: " << num1 << " / " << num2 << " = " << result << endl;
            } else {
                cout << "\nError: Division by zero!" << endl;
            }
            break;
        default:
            cout << "\nInvalid operator!" << endl;
    }
    
    cout << "\nPress any key to return to VS Code...";
    getch();
}
