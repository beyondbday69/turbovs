// Object-Oriented Programming with Turbo C++ 3.0
// Demonstrates classes, constructors, methods, and conio screen management

#include <iostream.h>
#include <conio.h>
#include <string.h>

class Student {
private:
    int rollNo;
    char name[30];
    float marks[3];
    float total;
    float percentage;

public:
    Student() {
        rollNo = 0;
        strcpy(name, "Unknown");
        total = 0.0;
        percentage = 0.0;
    }

    void input() {
        cout << "Enter Roll Number: ";
        cin >> rollNo;
        cout << "Enter Student Name: ";
        cin >> name;

        total = 0.0;
        for (int i = 0; i < 3; i++) {
            cout << "  Marks for Subject " << (i + 1) << " (out of 100): ";
            cin >> marks[i];
            total += marks[i];
        }
        percentage = total / 3.0;
    }

    void display() {
        cout << "\n----------------------------------------" << endl;
        cout << "           STUDENT REPORT CARD          " << endl;
        cout << "----------------------------------------" << endl;
        cout << "Roll No:    " << rollNo << endl;
        cout << "Name:       " << name << endl;
        cout << "Total:      " << total << " / 300" << endl;
        cout << "Percentage: " << percentage << "%" << endl;
        cout << "Result:     ";
        if (percentage >= 60.0) {
            cout << "First Class Distinction" << endl;
        } else if (percentage >= 50.0) {
            cout << "Second Class" << endl;
        } else if (percentage >= 40.0) {
            cout << "Pass" << endl;
        } else {
            cout << "Needs Improvement (Fail)" << endl;
        }
        cout << "----------------------------------------" << endl;
    }
};

void main() {
    clrscr();

    cout << "========================================" << endl;
    cout << "    Turbo C++ OOP: Student Database     " << endl;
    cout << "========================================" << endl << endl;

    Student s;
    s.input();
    s.display();

    cout << "\nPress any key to exit...";
    getch();
}
