#include <graphics.h>
#include <conio.h>
#include <iostream.h>

void main() {
    int gd = DETECT, gm;
    // BGI graphics driver folder in Turbo C++
    initgraph(&gd, &gm, "C:\\TC\\BGI");
    
    // Draw classic concentric circles
    setcolor(YELLOW);
    circle(320, 240, 50);
    setcolor(LIGHTGREEN);
    circle(320, 240, 80);
    setcolor(LIGHTCYAN);
    circle(320, 240, 110);
    
    // Title text
    setcolor(WHITE);
    outtextxy(180, 400, "Turbo C++ BGI Graphics in VS Code!");
    
    getch();
    closegraph();
}
