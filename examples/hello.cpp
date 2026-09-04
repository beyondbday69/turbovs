#include <iostream.h>
#include <conio.h>

void main() {
    clrscr();
    
    cout << "========================================" << endl;
    cout << "    Turbo C++ Runner for VS Code        " << endl;
    cout << "========================================" << endl;
    cout << "Legacy Turbo C++ syntax is fully active!" << endl;
    cout << endl;
    
    char name[40];
    cout << "Enter your name: ";
    cin >> name;
    
    cout << endl;
    cout << "Welcome, " << name << "!" << endl;
    cout << "Press any key to exit...";
    
    getch();
}
