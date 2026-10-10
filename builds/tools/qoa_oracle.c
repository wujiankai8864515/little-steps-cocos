/* Offline verification only: Godot's vendored decoder is not a game dependency. */
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>
#define QOA_IMPLEMENTATION
#include "vendor/qoa.h"
int main(int argc, char **argv) {
    if (argc != 2) return 2;
    FILE *f = fopen(argv[1], "rb");
    if (!f) return 3;
    fseek(f, 0, SEEK_END); long size = ftell(f); rewind(f);
    if (size <= 0 || size > INT_MAX) { fclose(f); return 4; }
    unsigned char *data = malloc((size_t)size);
    if (!data || fread(data, 1, size, f) != (size_t)size) { fclose(f); free(data); return 5; }
    fclose(f);
    qoa_desc desc = {0};
    short *pcm = qoa_decode(data, (int)size, &desc); free(data);
    if (!pcm) return 6;
    fprintf(stderr, "{\"channels\":%u,\"sampleRate\":%u,\"samples\":%u}\n", desc.channels, desc.samplerate, desc.samples);
    /* Explicit little endian rather than depending on host byte order. */
    for (size_t i = 0; i < (size_t)desc.channels * desc.samples; i++) {
        unsigned short value = (unsigned short)pcm[i];
        fputc(value & 255, stdout); fputc(value >> 8, stdout);
    }
    free(pcm); return ferror(stdout) ? 7 : 0;
}
