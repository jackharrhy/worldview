FROM node:24-bookworm-slim

RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl git unzip python3 build-essential gcc-multilib g++-multilib pkg-config cmake ninja-build \
      libsdl2-dev:i386 libfreetype-dev:i386 libopus-dev:i386 libbz2-dev:i386 \
      libvorbis-dev:i386 libopusfile-dev:i386 libogg-dev:i386 \
      libgl1-mesa-dri:i386 libgl1:i386 libstdc++6:i386 \
      libsdl2-2.0-0 libgl1-mesa-dri libgl1 libmad0 libopusfile0 libvorbisfile3 \
      xvfb xauth xdotool \
    && rm -rf /var/lib/apt/lists/*

ARG XASH_REVISION=1de8289f2980aa34c70760ae0ebfb2e00ddb0f9e
RUN git init /src/xash \
    && cd /src/xash \
    && git remote add origin https://github.com/FWGS/xash3d-fwgs.git \
    && git fetch --depth 1 origin "$XASH_REVISION" \
    && git checkout --detach FETCH_HEAD \
    && git submodule update --init --recursive --depth 1
RUN cd /src/xash \
    && PKG_CONFIG_PATH=/usr/lib/i386-linux-gnu/pkgconfig ./waf configure -T release --disable-werror \
    && ./waf build -j 4 \
    && ./waf install --destdir=/opt/xash \
    && git rev-parse HEAD > /opt/xash/revision.txt

ARG QSSM_VERSION=1.6.5
ARG QSSM_SHA256=8e76f7e57f1c8b4c99d5551e9e2a3c288414e5be16fac1f16179125b1bb63c58
RUN curl -fL "https://github.com/timbergeron/QSS-M/releases/download/${QSSM_VERSION}/QSS-M_v${QSSM_VERSION}_linux64.zip" -o /tmp/qssm.zip \
    && echo "$QSSM_SHA256  /tmp/qssm.zip" | sha256sum -c - \
    && mkdir /opt/qssm \
    && unzip -q /tmp/qssm.zip -d /opt/qssm \
    && chmod +x /opt/qssm/QSS-M-l64 \
    && rm /tmp/qssm.zip

ARG CS16_REVISION=57607ab038be0fc49b67c7a4a741ef8a44031577
RUN git init /src/cs16 \
    && cd /src/cs16 \
    && git remote add origin https://github.com/Velaron/cs16-client.git \
    && git fetch --depth 1 origin "$CS16_REVISION" \
    && git checkout --detach FETCH_HEAD \
    && git submodule update --init --recursive --depth 1
# The upstream configure step optionally downloads unpinned bot graphs. Captures need no bots.
RUN --network=none cd /src/cs16 \
    && cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE=toolchains/i386-linux-gnu.cmake -DBUILD_MAINUI=OFF -DBUILD_SERVER=OFF \
    && cmake --build build -j 4 \
    && cmake --install build --prefix /opt/cs16 \
    && git rev-parse HEAD > /opt/cs16/revision.txt

ENV LIBGL_ALWAYS_SOFTWARE=1 SDL_AUDIODRIVER=dummy
WORKDIR /work
COPY scene.mjs run.mjs /opt/capture/
